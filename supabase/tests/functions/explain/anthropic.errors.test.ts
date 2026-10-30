import { describe, expect, it, vi } from 'vitest';
import { askModel } from '../../../functions/explain/anthropic.ts';

const ask = (reply: () => Response | Promise<Response>) =>
  askModel({
    apiKey: 'sk-secret-key',
    system: 's',
    user: 'u',
    fetchImpl: vi.fn<typeof fetch>(async () => reply()),
  });

const errorBody = (type: unknown, message = 'Your credit balance is too low') =>
  JSON.stringify({ type: 'error', error: { type, message } });

describe('askModel error reason codes', () => {
  it.each([
    [400, 'invalid_request_error'],
    [401, 'authentication_error'],
    [404, 'not_found_error'],
    [429, 'rate_limit_error'],
    [529, 'overloaded_error'],
  ])('appends the error type to http_%i', async (status, type) => {
    const result = await ask(() => new Response(errorBody(type), { status }));
    expect(result).toEqual({ ok: false, reason: `http_${status}_${type}` });
  });

  it('never carries the message, key, prompt or body text in the reason', async () => {
    const result = await ask(
      () =>
        new Response(errorBody('invalid_request_error', 'echo: u sk-secret-key'), { status: 400 }),
    );
    const reason = (result as { reason: string }).reason;
    expect(reason).not.toMatch(/credit|echo|sk-secret|\bu\b/);
  });

  it.each([
    'not json at all',
    '',
    'null',
    '[]',
    '{"error":"nope"}',
    '{"error":{"type":42}}',
    '{"error":{}}',
  ])('falls back to plain http_<status> for body %j', async (body) => {
    expect(await ask(() => new Response(body, { status: 400 }))).toEqual({
      ok: false,
      reason: 'http_400',
    });
  });

  it.each(['Invalid Type', 'a', 'x'.repeat(41), 'bad\nline', 'sk-ant-123', 'drop;table', ''])(
    'omits an error type with odd characters or length: %j',
    async (type) => {
      expect(await ask(() => new Response(errorBody(type), { status: 400 }))).toEqual({
        ok: false,
        reason: 'http_400',
      });
    },
  );
});
