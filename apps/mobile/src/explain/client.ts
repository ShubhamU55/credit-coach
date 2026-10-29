import type { ExplainPayload } from '@credit-coach/engine';

export type ExplanationSource = 'ai' | 'template';

export interface Explanation {
  text: string;
  source: ExplanationSource;
}

export interface ExplainConfig {
  url: string;
  anonKey: string;
}

/** The hard limit the ticket sets; the function itself also caps its model call. */
export const EXPLAIN_TIMEOUT_MS = 3000;
const MAX_TEXT_LENGTH = 1500;

/**
 * Builds the config from the public Expo env values. Both are needed; either one missing or
 * blank means "template only" and the app never tries the network. The anon key is public by
 * design (row-level security guards the data); the Anthropic key never reaches the app.
 */
export function readExplainConfig(env: {
  url?: string | undefined;
  anonKey?: string | undefined;
}): ExplainConfig | null {
  const url = env.url?.trim().replace(/\/+$/, '');
  const anonKey = env.anonKey?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Expo only inlines `process.env.EXPO_PUBLIC_*` when written out literally, so keep it explicit. */
export function configFromExpoEnv(): ExplainConfig | null {
  return readExplainConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export const explainEndpoint = (config: ExplainConfig): string =>
  `${config.url}/functions/v1/explain`;

function parseResponse(body: unknown): Explanation | null {
  if (typeof body !== 'object' || body === null) return null;
  const { text, source } = body as Record<string, unknown>;
  if (typeof text !== 'string' || (source !== 'ai' && source !== 'template')) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return null;
  return { text: trimmed, source };
}

interface FetchExplanationOptions {
  payload: ExplainPayload;
  /** The engine's deterministic text, returned on every failure path. */
  template: string;
  config: ExplainConfig | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function callFunction(options: {
  payload: ExplainPayload;
  fetchImpl: typeof fetch;
  config: ExplainConfig;
  signal: AbortSignal;
}): Promise<Explanation | null> {
  const { payload, fetchImpl, config, signal } = options;
  const response = await fetchImpl(explainEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) return null;
  return parseResponse(await response.json());
}

/**
 * Asks the `explain` Edge Function for the wording. It never throws: a missing config, a
 * timeout, a network error, a non-2xx status or a malformed body all return the template.
 * The failure reason is deliberately not surfaced; the UI shows the template silently.
 */
export async function fetchExplanation(options: FetchExplanationOptions): Promise<Explanation> {
  const fallback: Explanation = { text: options.template, source: 'template' };
  const { config } = options;
  if (!config) return fallback;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, options.timeoutMs ?? EXPLAIN_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([
      callFunction({
        payload: options.payload,
        fetchImpl: options.fetchImpl ?? fetch,
        config,
        signal: controller.signal,
      }),
      timeout,
    ]);
    return result ?? fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
