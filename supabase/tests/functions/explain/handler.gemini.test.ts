import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleExplain, type ExplainDeps } from '../../../functions/explain/handler.ts';
import { createRateLimiter } from '../../../functions/explain/ratelimit.ts';
import { templateFromPayload } from '../../../functions/explain/template.ts';
import { scenario } from './fixtures.ts';

/** Not real keys; only used to prove which provider is called and that no key leaks. */
const GEMINI_KEY = 'gemini-key-not-a-secret-0001';
const ANTHROPIC_KEY = 'anthropic-key-not-a-secret-0001';

const aarav = scenario('aarav').payload;
const TEMPLATE = templateFromPayload(aarav);
const REWORDED =
  'Axis Neo needs ₹620 by Thu, 22 Oct, and HDFC Millennia needs ₹3,710 by Wed, 4 Nov, so nothing is missed. Then ₹11,780 clears the Axis Neo statement and ₹70,490 clears the HDFC Millennia statement, which means no interest. ' +
  'Paying ₹2,400 on SBI SimplyClick by Sat, 24 Oct brings overall utilization from 45.0% to 15.3%, and ₹31,000 is left over.';

const post = (): Request =>
  new Request('https://example.test/functions/v1/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(aarav),
  });

const geminiReply = (text: string): Response =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const limiter = () => createRateLimiter({ max: 1000, windowMs: 60_000, now: () => Date.now() });

const deps = (fetchImpl: typeof fetch, over: Partial<ExplainDeps> = {}): ExplainDeps => ({
  apiKey: undefined,
  fetchImpl,
  authenticate: async () => ({ ok: true, userId: '00000000-0000-4000-8000-0000000000aa' }),
  userLimiter: limiter(),
  ipLimiter: limiter(),
  ...over,
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('explain handler: the Gemini provider', () => {
  it('returns the Gemini text with source "ai" when a Gemini key is set', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => geminiReply(REWORDED));

    const response = await handleExplain(post(), deps(fetchMock, { geminiApiKey: GEMINI_KEY }));

    expect(await response.json()).toEqual({ text: REWORDED, source: 'ai' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(GEMINI_KEY);
  });

  it('prefers Gemini over Anthropic when both keys are set, and never calls Anthropic', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => geminiReply(REWORDED));

    await handleExplain(
      post(),
      deps(fetchMock, { geminiApiKey: GEMINI_KEY, apiKey: ANTHROPIC_KEY }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('anthropic.com');
  });

  it('passes the model override through to the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => geminiReply(REWORDED));

    await handleExplain(
      post(),
      deps(fetchMock, { geminiApiKey: GEMINI_KEY, geminiModel: 'gemini-test-model' }),
    );

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/models/gemini-test-model:');
  });

  it('falls back to the template with the Gemini reason code when Gemini fails', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'model gone' } }), {
          status: 404,
        }),
    );

    const response = await handleExplain(post(), deps(fetchMock, { geminiApiKey: GEMINI_KEY }));

    expect(await response.json()).toEqual({ text: TEMPLATE, source: 'template' });
    expect(warn).toHaveBeenCalledWith('explain fallback', 'http_404_not_found');
  });

  it('still rejects Gemini text whose numbers are not in the payload', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => geminiReply('Pay ₹9,99,999 today.'));

    const response = await handleExplain(post(), deps(fetchMock, { geminiApiKey: GEMINI_KEY }));

    expect(await response.json()).toEqual({ text: TEMPLATE, source: 'template' });
    expect(warn).toHaveBeenCalledWith('explain fallback', 'ungrounded_or_forbidden');
  });

  it('never logs or returns the key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('x', { status: 500 }));

    const response = await handleExplain(post(), deps(fetchMock, { geminiApiKey: GEMINI_KEY }));

    expect(JSON.stringify(await response.json())).not.toContain(GEMINI_KEY);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(GEMINI_KEY);
  });

  it('uses the template with reason no_key when no provider key is set', async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const response = await handleExplain(post(), deps(fetchMock));

    expect(await response.json()).toEqual({ text: TEMPLATE, source: 'template' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('explain fallback', 'no_key');
  });
});
