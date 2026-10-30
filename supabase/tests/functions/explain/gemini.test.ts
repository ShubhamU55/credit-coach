import { describe, expect, it, vi } from 'vitest';
import { askGemini, GEMINI_MODEL } from '../../../functions/explain/gemini.ts';

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: 'Pay the minimums first. ' }, { text: 'Then the rest.' }] },
      },
    ],
    ...over,
  });

const ask = (respond: () => Response | Promise<Response>, over: Record<string, unknown> = {}) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => respond());
  const result = askGemini({
    apiKey: 'gem-secret-key',
    system: 'sys',
    user: 'usr',
    fetchImpl,
    ...over,
  });
  return { fetchImpl, result };
};

describe('askGemini', () => {
  it('returns the joined text of a finished answer', async () => {
    const { result } = ask(() => new Response(reply(), { status: 200 }));
    expect(await result).toEqual({ ok: true, text: 'Pay the minimums first. Then the rest.' });
  });

  it('sends the key in a header, never in the URL, with the prompt and a zero-temperature config', async () => {
    const { fetchImpl, result } = ask(() => new Response(reply(), { status: 200 }));
    await result;
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    );
    expect(url).not.toContain('gem-secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('gem-secret-key');
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('usr');
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(400);
  });

  it('uses the model override when one is given', async () => {
    const { fetchImpl, result } = ask(() => new Response(reply(), { status: 200 }), {
      model: 'gemini-test-model',
    });
    await result;
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/models/gemini-test-model:');
  });

  it.each([
    [400, 'INVALID_ARGUMENT', 'http_400_invalid_argument'],
    [403, 'PERMISSION_DENIED', 'http_403_permission_denied'],
    [404, 'NOT_FOUND', 'http_404_not_found'],
    [429, 'RESOURCE_EXHAUSTED', 'http_429_resource_exhausted'],
  ])('names the error status for http %i', async (status, name, expected) => {
    const { result } = ask(
      () =>
        new Response(JSON.stringify({ error: { status: name, message: 'echo usr' } }), { status }),
    );
    expect(await result).toEqual({ ok: false, reason: expected });
  });

  it('never carries the message, key or prompt in the reason', async () => {
    const { result } = ask(
      () =>
        new Response(
          JSON.stringify({
            error: { status: 'INVALID_ARGUMENT', message: 'echo usr gem-secret-key' },
          }),
          { status: 400 },
        ),
    );
    expect(((await result) as { reason: string }).reason).not.toMatch(/echo|usr|gem-secret/);
  });

  it.each(['not json', '', 'null', '{"error":{"status":42}}'])(
    'falls back to plain http_<status> for body %j',
    async (body) => {
      const { result } = ask(() => new Response(body, { status: 500 }));
      expect(await result).toEqual({ ok: false, reason: 'http_500' });
    },
  );

  it.each([
    [
      'cut off by the token limit',
      {
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'half a sen' }] } }],
      },
    ],
    ['blocked for safety', { candidates: [{ finishReason: 'SAFETY' }] }],
    ['prompt blocked', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['no candidates', { candidates: [] }],
    [
      'empty text',
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }] } }] },
    ],
  ])('treats a reply that is %s as bad_reply', async (_name, body) => {
    const { result } = ask(() => new Response(JSON.stringify(body), { status: 200 }));
    expect(await result).toEqual({ ok: false, reason: 'bad_reply' });
  });

  it('gives up with timeout when the call hangs', async () => {
    const { result } = ask(() => new Promise<Response>(() => undefined), { timeoutMs: 20 });
    expect(await result).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports network when fetch throws', async () => {
    const { result } = ask(() => {
      throw new TypeError('boom');
    });
    expect(await result).toEqual({ ok: false, reason: 'network' });
  });
});
