import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clientAddress,
  handleExplain,
  type ExplainDeps,
} from '../../../functions/explain/handler.ts';
import { createRateLimiter } from '../../../functions/explain/ratelimit.ts';
import { templateFromPayload } from '../../../functions/explain/template.ts';
import { scenario } from './fixtures.ts';

// Guards around the model call: who may call, rate limits, finished replies, forbidden wording
// and request shape. The happy path and the timeout live in handler.test.ts.

const aarav = scenario('aarav').payload;
const AARAV_TEMPLATE = templateFromPayload(aarav);
const USER_ID = '00000000-0000-4000-8000-0000000000aa';

const post = (body: unknown, init: RequestInit = {}): Request =>
  new Request('https://example.test/functions/v1/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

const modelReply = (text: string, extra: Record<string, unknown> = {}): Response =>
  new Response(
    JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', ...extra }),
  );

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
const fetchReturning = (make: () => Response): FetchMock => vi.fn<typeof fetch>(async () => make());

const limiter = (max: number) =>
  createRateLimiter({ max, windowMs: 60_000, now: () => Date.now() });

const deps = (fetchImpl: FetchMock, over: Partial<ExplainDeps> = {}): ExplainDeps => ({
  apiKey: 'test-key-not-a-secret-0001',
  fetchImpl,
  authenticate: async () => ({ ok: true, userId: USER_ID }),
  userLimiter: limiter(1000),
  ipLimiter: limiter(1000),
  ...over,
});

async function expectTemplate(response: Response) {
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: AARAV_TEMPLATE, source: 'template' });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const okReply = () => modelReply('Pay ₹620 on Axis Neo by 22nd Oct.');

describe('who may call', () => {
  it('answers 401 and never calls the model when there is no signed-in user', async () => {
    const fetchMock = fetchReturning(okReply);
    const authenticate = async () => ({ ok: false as const, reason: 'unauthenticated' as const });

    const response = await handleExplain(post(aarav), deps(fetchMock, { authenticate }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 and never calls the model when the sign-in service is unreachable', async () => {
    const fetchMock = fetchReturning(okReply);
    const authenticate = async () => ({ ok: false as const, reason: 'unavailable' as const });

    const response = await handleExplain(post(aarav), deps(fetchMock, { authenticate }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the caller before it reads or validates the body', async () => {
    const authenticate = async () => ({ ok: false as const, reason: 'unauthenticated' as const });

    const response = await handleExplain(
      post('not json{'),
      deps(fetchReturning(okReply), { authenticate }),
    );

    expect(response.status).toBe(401);
  });
});

describe('rate limit (best effort, in memory)', () => {
  it('answers 429 on the call after the limit and does NOT call the model for it', async () => {
    const fetchMock = fetchReturning(okReply);
    const d = deps(fetchMock, { userLimiter: limiter(3) });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await handleExplain(post(aarav), d)).status);

    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends Retry-After and a JSON error with the 429', async () => {
    const d = deps(fetchReturning(okReply), { userLimiter: limiter(1) });
    await handleExplain(post(aarav), d);

    const response = await handleExplain(post(aarav), d);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(await response.json()).toEqual({ error: 'rate_limited' });
  });

  it('counts per user: one user at the limit does not block another', async () => {
    const fetchMock = fetchReturning(okReply);
    const userLimiter = limiter(1);
    const asUser = (id: string) =>
      deps(fetchMock, { userLimiter, authenticate: async () => ({ ok: true, userId: id }) });

    const first = await handleExplain(post(aarav), asUser('user-a'));
    const again = await handleExplain(post(aarav), asUser('user-a'));
    const other = await handleExplain(post(aarav), asUser('user-b'));

    expect([first.status, again.status, other.status]).toEqual([200, 429, 200]);
  });

  describe('per network address', () => {
    /** Many different user ids (anonymous sign-in is cheap), all calling through one address. */
    function setup(max: number) {
      const fetchMock = fetchReturning(okReply);
      let n = 0;
      const d = deps(fetchMock, {
        ipLimiter: limiter(max),
        authenticate: async () => {
          n += 1;
          return { ok: true, userId: `user-${n}` };
        },
      });
      const from = (headers: Record<string, string>) =>
        post(aarav, { headers: { 'content-type': 'application/json', ...headers } });
      return { fetchMock, d, from };
    }

    it('caps one address across many user ids, using the rightmost forwarded hop', async () => {
      const { fetchMock, d, from } = setup(2);
      const hop = (ip: string) => ({ 'x-forwarded-for': `10.9.9.9, ${ip}` });

      const statuses = [
        (await handleExplain(from(hop('203.0.113.9')), d)).status,
        (await handleExplain(from(hop('203.0.113.9')), d)).status,
        (await handleExplain(from(hop('203.0.113.9')), d)).status,
        (await handleExplain(from(hop('198.51.100.7')), d)).status,
      ];

      expect(statuses).toEqual([200, 200, 429, 200]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('is not fooled by a spoofed leading X-Forwarded-For value that changes on every call', async () => {
      const { fetchMock, d, from } = setup(2);

      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const headers = { 'x-forwarded-for': `198.18.0.${i}, 203.0.113.9` };
        statuses.push((await handleExplain(from(headers), d)).status);
      }

      expect(statuses).toEqual([200, 200, 429, 429]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('trusts cf-connecting-ip over any forwarded value, and ignores x-real-ip', async () => {
      const cf = setup(1);
      const first = await handleExplain(
        cf.from({
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
        }),
        cf.d,
      );
      const second = await handleExplain(
        cf.from({
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '3.3.3.3',
          'x-real-ip': '4.4.4.4',
        }),
        cf.d,
      );
      // x-real-ip is client-settable, so with only it present there is no address key at all.
      const spoof = setup(1);
      const spoofStatuses: number[] = [];
      for (const ip of ['5.5.5.5', '6.6.6.6', '7.7.7.7']) {
        spoofStatuses.push((await handleExplain(spoof.from({ 'x-real-ip': ip }), spoof.d)).status);
      }

      expect([first.status, second.status]).toEqual([200, 429]);
      expect(spoofStatuses).toEqual([200, 200, 200]);
      expect(clientAddress(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBeNull();
      expect(
        clientAddress(new Headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': 'a, b' })),
      ).toBe('b');
    });

    it('keeps no address limit when the platform reports none, and ignores blank or empty entries', async () => {
      const { fetchMock, d, from } = setup(1);

      const none = [await handleExplain(from({}), d), await handleExplain(from({}), d)];
      const blank = [
        await handleExplain(from({ 'x-forwarded-for': ' , ' }), d),
        await handleExplain(from({ 'x-forwarded-for': '' }), d),
      ];

      expect([...none, ...blank].map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  it('counts rejected requests too, so bad input cannot be used to probe for free', async () => {
    const d = deps(fetchReturning(okReply), { userLimiter: limiter(2) });

    const statuses = [
      (await handleExplain(post('nope'), d)).status,
      (await handleExplain(post({}), d)).status,
      (await handleExplain(post(aarav), d)).status,
    ];

    expect(statuses).toEqual([400, 400, 429]);
  });
});

describe('the reply must be a finished answer', () => {
  const text = 'Pay ₹620 on Axis Neo by 22nd Oct.';

  it.each(['refusal', 'tool_use', 'pause_turn', undefined])(
    'uses the template when stop_reason is %s',
    async (stopReason) => {
      const body = JSON.stringify({ content: [{ type: 'text', text }], stop_reason: stopReason });

      const response = await handleExplain(
        post(aarav),
        deps(fetchReturning(() => new Response(body))),
      );

      await expectTemplate(response);
    },
  );

  it('accepts stop_sequence as a finished answer', async () => {
    const make = () => modelReply(text, { stop_reason: 'stop_sequence' });

    const response = await handleExplain(post(aarav), deps(fetchReturning(make)));

    expect(await response.json()).toEqual({ text, source: 'ai' });
  });
});

describe('forbidden wording and swapped numbers fall back', () => {
  it.each([
    ['a score claim', 'Pay ₹620 on Axis Neo. Your score could reach 750 soon.'],
    [
      'advice to close a card',
      'Pay ₹620 on Axis Neo, then consider closing the SBI SimplyClick card.',
    ],
    ['a guarantee', 'Pay ₹620 on Axis Neo, which is guaranteed to help.'],
    ['spelled-out numbers', 'Pay six hundred twenty rupees on Axis Neo.'],
    ['a link', 'Pay ₹620 on Axis Neo, see https://example.com for details.'],
    ['a markdown link', 'Pay ₹620 on [Axis Neo](http://x.y) first.'],
    ['an amount on the wrong card', 'Pay ₹70,490 on Axis Neo by 22nd Oct.'],
    ['date digits used as a percent', 'Pay ₹620 on Axis Neo and utilization falls to 21%.'],
  ])('uses the template for %s', async (_name, text) => {
    const response = await handleExplain(post(aarav), deps(fetchReturning(() => modelReply(text))));

    await expectTemplate(response);
  });
});

describe('request shape', () => {
  it('answers 415 for a body that is not application/json (text/plain is pinned)', async () => {
    const fetchMock = fetchReturning(okReply);
    const plain = post(JSON.stringify(aarav), { headers: { 'content-type': 'text/plain' } });
    const none = post(JSON.stringify(aarav), { headers: {} });

    expect((await handleExplain(plain, deps(fetchMock))).status).toBe(415);
    expect((await handleExplain(none, deps(fetchMock))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts application/json with a charset', async () => {
    const request = post(JSON.stringify(aarav), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const response = await handleExplain(
      request,
      deps(fetchReturning(okReply), { apiKey: undefined }),
    );

    expect(response.status).toBe(200);
  });

  it('answers 405 for HEAD, DELETE and PATCH without authenticating or calling anything', async () => {
    const fetchMock = fetchReturning(okReply);
    const authenticate = vi.fn(async () => ({ ok: true as const, userId: USER_ID }));
    const url = 'https://example.test/functions/v1/explain';

    for (const method of ['HEAD', 'DELETE', 'PATCH']) {
      const response = await handleExplain(
        new Request(url, { method }),
        deps(fetchMock, { authenticate }),
      );
      expect(response.status).toBe(405);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects an own __proto__ key, 1e999 and a utilization of 1001', async () => {
    const fetchMock = fetchReturning(okReply);
    const body = JSON.stringify(aarav);
    const proto = body.replace('{', '{"__proto__":{"admin":true},');
    const infinite = body.replace(/"cashUsed":\d+/, '"cashUsed":1e999');
    const overUtilised = body.replace(/"utilizationBefore":[\d.]+/, '"utilizationBefore":1001');
    expect(infinite).not.toBe(body);
    expect(overUtilised).not.toBe(body);

    for (const bad of [proto, infinite, overUtilised]) {
      const response = await handleExplain(post(bad), deps(fetchMock));
      expect(response.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
