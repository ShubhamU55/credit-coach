import type { ExplainPayload } from '@credit-coach/engine';

import { setAccessToken } from '../backend/session';
import { configFromExpoEnv, explainEndpoint, fetchExplanation, readExplainConfig } from './client';

const PAYLOAD: ExplainPayload = {
  version: 1,
  today: '2026-10-21',
  thresholdPct: 30,
  aimFor10: false,
  summaryCode: 'all_within_threshold',
  items: [],
  shortfalls: [],
  cashUsed: 0,
  leftover: 0,
  overallUtilizationBefore: null,
  overallUtilizationAfter: null,
  highestCardBefore: null,
  highestCardAfter: null,
  withinThreshold: true,
};
const TEMPLATE = 'Template text.';
const CONFIG = { url: 'https://example.test', anonKey: 'anon' };

const respond = (body: unknown, ok = true): typeof fetch =>
  jest.fn(
    async (_url: string, _init?: RequestInit) => ({ ok, json: async () => body }) as Response,
  ) as unknown as typeof fetch;

const run = (fetchImpl: typeof fetch, config: typeof CONFIG | null = CONFIG, timeoutMs = 50) =>
  fetchExplanation({ payload: PAYLOAD, template: TEMPLATE, config, fetchImpl, timeoutMs });

describe('readExplainConfig', () => {
  it('is null when either variable is missing or blank', () => {
    expect(readExplainConfig({})).toBeNull();
    expect(readExplainConfig({ url: 'https://x.test', anonKey: ' ' })).toBeNull();
    expect(readExplainConfig({ url: '', anonKey: 'k' })).toBeNull();
  });

  it('treats a non-https URL as unconfigured', () => {
    expect(readExplainConfig({ url: 'http://x.test', anonKey: 'k' })).toBeNull();
    expect(readExplainConfig({ url: 'ftp://x.test', anonKey: 'k' })).toBeNull();
    expect(readExplainConfig({ url: 'x.test', anonKey: 'k' })).toBeNull();
  });

  it('trims a trailing slash and builds the function endpoint', () => {
    const config = readExplainConfig({ url: 'https://x.test/', anonKey: 'k' });

    expect(config).toEqual({ url: 'https://x.test', anonKey: 'k' });
    expect(explainEndpoint(config!)).toBe('https://x.test/functions/v1/explain');
  });
});

describe('fetchExplanation', () => {
  it('returns AI text when the function answers with source ai', async () => {
    const result = await run(respond({ text: 'Because it helps.', source: 'ai' }));

    expect(result).toEqual({ text: 'Because it helps.', source: 'ai' });
  });

  it('ignores the body text when the server says template and uses the local template', async () => {
    const result = await run(respond({ text: 'Unchecked server text 99.', source: 'template' }));

    expect(result).toEqual({ text: TEMPLATE, source: 'template' });
  });

  it('sends the payload as JSON with the public anon key', async () => {
    const fetchImpl = respond({ text: 'ok', source: 'ai' });

    await run(fetchImpl);

    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.test/functions/v1/explain');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
    expect(init.headers.apikey).toBe('anon');
  });

  it('falls back to the template without calling out when not configured', async () => {
    const fetchImpl = respond({ text: 'x', source: 'ai' });

    const result = await run(fetchImpl, null);

    expect(result).toEqual({ text: TEMPLATE, source: 'template' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the template when the function times out', async () => {
    const hangs = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const result = await run(hangs, CONFIG, 20);

    expect(result).toEqual({ text: TEMPLATE, source: 'template' });
  });

  it('falls back when the function returns malformed JSON', async () => {
    const badJson = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })) as unknown as typeof fetch;

    expect(await run(badJson)).toEqual({ text: TEMPLATE, source: 'template' });
  });

  it.each([
    ['a missing text', { source: 'ai' }],
    ['an empty text', { text: '   ', source: 'ai' }],
    ['a non-string text', { text: 42, source: 'ai' }],
    ['an unknown source', { text: 'hi', source: 'magic' }],
    ['a non-object body', 'oops'],
    ['null', null],
  ])('falls back on %s', async (_label, body) => {
    expect(await run(respond(body))).toEqual({ text: TEMPLATE, source: 'template' });
  });

  it('falls back on a non-2xx status', async () => {
    expect(await run(respond({ text: 'x', source: 'ai' }, false))).toEqual({
      text: TEMPLATE,
      source: 'template',
    });
  });

  it('falls back when the network call rejects', async () => {
    const rejects = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    expect(await run(rejects)).toEqual({ text: TEMPLATE, source: 'template' });
  });
});

describe('number grounding (non-negotiable 2)', () => {
  const PAY: ExplainPayload = {
    ...PAYLOAD,
    items: [
      {
        step: 1,
        kind: 'minimum',
        card: 'Axis Neo',
        amount: 620,
        payBy: '2026-10-22',
        reasonCode: 'minimum_due_soon',
        utilizationBefore: 19.5,
        utilizationAfter: 18.7,
      },
    ],
  };
  const check = (text: string) =>
    fetchExplanation({
      payload: PAY,
      template: TEMPLATE,
      config: CONFIG,
      fetchImpl: respond({ text, source: 'ai' }),
      timeoutMs: 50,
    });

  it('falls back to the template when the AI text carries numbers the engine did not compute', async () => {
    expect(await check('Pay ₹5,000 on Axis Neo by 25 Oct.')).toEqual({
      text: TEMPLATE,
      source: 'template',
    });
  });

  it('accepts AI text whose numbers all come from the payload, ignoring commas and suffixes', async () => {
    const text = 'Pay ₹620 on Axis Neo by 22nd Oct so utilization drops from 19.5% to 18.7%.';

    expect(await check(text)).toEqual({ text, source: 'ai' });
  });

  it('no longer accepts a number just because the template text has it', async () => {
    const result = await fetchExplanation({
      payload: PAY,
      template: 'Overall goes to 15.3%.',
      config: CONFIG,
      fetchImpl: respond({ text: 'It lands at 15.3% overall.', source: 'ai' }),
      timeoutMs: 50,
    });

    expect(result).toEqual({ text: 'Overall goes to 15.3%.', source: 'template' });
  });

  it('falls back when a date digit is used as a percent or an amount is swapped', async () => {
    for (const text of [
      'Utilization falls to 22%.',
      'Pay ₹620 on Axis Neo by 22nd Oct, so 31% is reported.',
      'Pay ₹22 on Axis Neo.',
    ]) {
      expect((await check(text)).source).toBe('template');
    }
  });

  it('falls back on forbidden wording: score claims, closing a card, spelled-out numbers, links', async () => {
    for (const text of [
      'Your score could reach 750 after paying ₹620 on Axis Neo.',
      'Closing Axis Neo would help, after paying ₹620.',
      'Pay six hundred twenty rupees on Axis Neo.',
      'Pay ₹620 on Axis Neo, see https://example.com.',
    ]) {
      expect((await check(text)).source).toBe('template');
    }
  });
});

describe('access token', () => {
  it('sends the signed-in user session as the bearer token and the anon key as apikey', async () => {
    const fetchImpl = jest.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: true, json: async () => ({ text: 'x', source: 'template' }) }) as Response,
    );

    await fetchExplanation({
      payload: PAYLOAD,
      template: TEMPLATE,
      config: { ...CONFIG, accessToken: 'user-session-token' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      apikey: 'anon',
      Authorization: 'Bearer user-session-token',
    });
  });

  it('falls back to the anon key as the bearer when there is no session (the server then answers 401 and the template shows)', async () => {
    const fetchImpl = jest.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: false, status: 401, json: async () => ({}) }) as Response,
    );

    const result = await fetchExplanation({
      payload: PAYLOAD,
      template: TEMPLATE,
      config: CONFIG,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer anon' });
    expect(result).toEqual({ text: TEMPLATE, source: 'template' });
  });
});

describe('access token getter', () => {
  const okFetch = () =>
    jest.fn(
      async (_url: string, _init?: RequestInit) =>
        ({ ok: true, json: async () => ({ text: 'x', source: 'template' }) }) as Response,
    );
  const headersOf = (fetchImpl: ReturnType<typeof okFetch>) =>
    (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers;

  afterEach(() => setAccessToken(undefined));

  it('reads the token at call time, so a session that arrived after config time is used', async () => {
    let token: string | undefined;
    const config = { ...CONFIG, getAccessToken: () => token };
    token = 'late.session.token';
    const fetchImpl = okFetch();

    await fetchExplanation({
      payload: PAYLOAD,
      template: TEMPLATE,
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    expect(headersOf(fetchImpl)).toMatchObject({ Authorization: 'Bearer late.session.token' });
  });

  it('falls back to the anon key when the getter has no token yet', async () => {
    const fetchImpl = okFetch();

    await fetchExplanation({
      payload: PAYLOAD,
      template: TEMPLATE,
      config: { ...CONFIG, getAccessToken: () => undefined },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    expect(headersOf(fetchImpl)).toMatchObject({ Authorization: 'Bearer anon' });
  });

  it('wires the in-memory anonymous session into the env-built config', async () => {
    const previous = { ...process.env };
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    try {
      const config = configFromExpoEnv();
      setAccessToken('anon.session.jwt');
      const fetchImpl = okFetch();

      await fetchExplanation({
        payload: PAYLOAD,
        template: TEMPLATE,
        config,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 50,
      });

      expect(headersOf(fetchImpl)).toMatchObject({ Authorization: 'Bearer anon.session.jwt' });
    } finally {
      process.env = previous;
    }
  });
});

describe('abort and diagnostics', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('returns the template and aborts the request when the caller aborts', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const hangs = jest.fn((_url: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const pending = fetchExplanation({
      payload: PAYLOAD,
      template: TEMPLATE,
      config: CONFIG,
      fetchImpl: hangs,
      timeoutMs: 5000,
      signal: controller.signal,
    });
    controller.abort();

    expect(await pending).toEqual({ text: TEMPLATE, source: 'template' });
    expect(seen?.aborted).toBe(true);
  });

  it('warns once in dev with a reason code and never the payload or key', async () => {
    await run(respond({}, false));

    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0].join(' ');
    expect(args).toContain('explain fallback');
    expect(args).toContain('http_');
    expect(args).not.toContain('anon');
    expect(args).not.toContain('2026-10-21');
  });

  it('stays quiet when simply unconfigured', async () => {
    await run(respond({}), null);

    expect(warn).not.toHaveBeenCalled();
  });
});
