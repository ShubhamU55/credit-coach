import type { ExplainPayload } from '@credit-coach/engine';

import { explainEndpoint, fetchExplanation, readExplainConfig } from './client';

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
  jest.fn(async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;

const run = (fetchImpl: typeof fetch, config: typeof CONFIG | null = CONFIG, timeoutMs = 50) =>
  fetchExplanation({ payload: PAYLOAD, template: TEMPLATE, config, fetchImpl, timeoutMs });

describe('readExplainConfig', () => {
  it('is null when either variable is missing or blank', () => {
    expect(readExplainConfig({})).toBeNull();
    expect(readExplainConfig({ url: 'https://x.test', anonKey: ' ' })).toBeNull();
    expect(readExplainConfig({ url: '', anonKey: 'k' })).toBeNull();
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

  it('keeps the function template as template, not AI', async () => {
    const result = await run(respond({ text: 'Server template.', source: 'template' }));

    expect(result).toEqual({ text: 'Server template.', source: 'template' });
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
    const badJson = jest.fn(async () => ({
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
