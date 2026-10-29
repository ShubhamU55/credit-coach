import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExplanation } from '../../../../apps/mobile/src/explain/client.ts';
import { handleExplain, type ExplainDeps } from '../../../functions/explain/handler.ts';
import { createRateLimiter } from '../../../functions/explain/ratelimit.ts';
import { scenario } from './fixtures.ts';

declare global {
  // React Native's dev flag, read by the app client under test.
  var __DEV__: boolean;
}

// The real handler's 200 body, piped through the app's own client (its parseResponse and grounding),
// so the two sides of the contract cannot drift apart unnoticed.

const payload = scenario('aarav').payload;
const AI_TEXT = 'Pay ₹620 on Axis Neo by 22nd Oct.';
const limiter = () => createRateLimiter({ max: 100, windowMs: 60_000, now: () => Date.now() });

const deps = (modelText: string): ExplainDeps => ({
  apiKey: 'test-key-not-a-secret-0001',
  fetchImpl: async () =>
    new Response(
      JSON.stringify({ content: [{ type: 'text', text: modelText }], stop_reason: 'end_turn' }),
    ),
  authenticate: async () => ({ ok: true, userId: '00000000-0000-4000-8000-0000000000aa' }),
  userLimiter: limiter(),
  ipLimiter: limiter(),
});

/** A fetch for the app client that is answered by the real handler. */
const viaHandler =
  (d: ExplainDeps): typeof fetch =>
  async (_url, init) =>
    handleExplain(
      new Request('https://example.test/functions/v1/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: init?.body as string,
      }),
      d,
    );

const run = (d: ExplainDeps) =>
  fetchExplanation({
    payload,
    template: 'local template',
    config: { url: 'https://x.test', anonKey: 'k' },
    fetchImpl: viaHandler(d),
  });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  Object.assign(globalThis, { __DEV__: false });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleExplain 200 body through the app client', () => {
  it('an ai answer is accepted by the app as ai text', async () => {
    expect(await run(deps(AI_TEXT))).toEqual({ text: AI_TEXT, source: 'ai' });
  });

  it('a template answer is replaced by the app local template', async () => {
    expect(await run(deps('Pay ₹999 on Axis Neo.'))).toEqual({
      text: 'local template',
      source: 'template',
    });
  });
});
