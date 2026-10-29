import type { ExplainPayload } from '@credit-coach/engine';

import { isAcceptableAiText } from './grounding';

export type ExplanationSource = 'ai' | 'template';

export interface Explanation {
  text: string;
  source: ExplanationSource;
}

export interface ExplainConfig {
  url: string;
  anonKey: string;
  /**
   * The signed-in user's session access token (anonymous sign-in users included). The function
   * rejects the bare anon key with 401, so without a session the app simply shows the template.
   */
  accessToken?: string;
}

/** The hard limit the ticket sets; the function itself also caps its model call. */
export const EXPLAIN_TIMEOUT_MS = 3000;
const MAX_TEXT_LENGTH = 1500;

/**
 * Builds the config from the public Expo env values. Both are needed and the URL must be https; anything else means "template only" and the app never tries the network. The anon key is public by
 * design (row-level security guards the data); the Anthropic key never reaches the app.
 */
export function readExplainConfig(env: {
  url?: string | undefined;
  anonKey?: string | undefined;
}): ExplainConfig | null {
  const url = env.url?.trim().replace(/\/+$/, '');
  const anonKey = env.anonKey?.trim();
  // https only: the anon key and the plan numbers must never travel in clear text.
  if (!url || !anonKey || !url.startsWith('https://')) return null;
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

/** Why a call fell back. Codes only: never the payload, the key or the response body. */
type FallbackReason =
  | 'not_configured'
  | 'aborted'
  | 'timeout'
  | 'server_template'
  | 'bad_body'
  | 'ungrounded_numbers'
  | `http_${number}`
  | `error_${string}`;

function warnFallback(reason: FallbackReason): void {
  if (!__DEV__ || reason === 'not_configured' || reason === 'aborted') return;
  console.warn('explain fallback', reason);
}

/**
 * Non-negotiable 2: the LLM never produces a number. AI text is accepted only if every number
 * in it is the right kind of number and is in the payload (an amount of the named card, a
 * utilization percent, a date from the plan), and it holds no forbidden wording (score claims,
 * closing a card, spelled-out numbers, links). The rules live in grounding.ts, a byte-identical
 * copy of the Edge Function's own. A false positive only costs the template.
 */
export function numbersAreGrounded(text: string, payload: ExplainPayload): boolean {
  return isAcceptableAiText(text, payload);
}

function parseResponse(body: unknown): { text: string; source: ExplanationSource } | null {
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
  /** Lets the caller cancel an in-flight call (unmount, plan changed). */
  signal?: AbortSignal;
}

type Outcome = { ok: true; text: string } | { ok: false; reason: FallbackReason };

async function callFunction(options: {
  payload: ExplainPayload;
  fetchImpl: typeof fetch;
  config: ExplainConfig;
  signal: AbortSignal;
}): Promise<Outcome> {
  const { payload, fetchImpl, config, signal } = options;
  const response = await fetchImpl(explainEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.accessToken ?? config.anonKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) return { ok: false, reason: `http_${response.status}` };
  const parsed = parseResponse(await response.json());
  if (!parsed) return { ok: false, reason: 'bad_body' };
  // Never show server-supplied text unlabelled: a template answer is replaced by ours.
  if (parsed.source === 'template') return { ok: false, reason: 'server_template' };
  if (!numbersAreGrounded(parsed.text, payload)) {
    return { ok: false, reason: 'ungrounded_numbers' };
  }
  return { ok: true, text: parsed.text };
}

/**
 * Asks the `explain` Edge Function for the wording. It never throws: a missing config, a
 * timeout, an abort, a network error, a non-2xx status, a malformed body or AI text with
 * numbers the engine did not compute all return the template. The reason is surfaced only as
 * a code in a dev-build warning; the UI shows the template silently.
 */
export async function fetchExplanation(options: FetchExplanationOptions): Promise<Explanation> {
  const fallback: Explanation = { text: options.template, source: 'template' };
  const { config, signal } = options;
  if (!config) {
    warnFallback('not_configured');
    return fallback;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stop = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'timeout' });
    }, options.timeoutMs ?? EXPLAIN_TIMEOUT_MS);
    onAbort = () => {
      controller.abort();
      resolve({ ok: false, reason: 'aborted' });
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort);
  });
  try {
    const outcome = await Promise.race([
      callFunction({
        payload: options.payload,
        fetchImpl: options.fetchImpl ?? fetch,
        config,
        signal: controller.signal,
      }),
      stop,
    ]);
    if (outcome.ok) return { text: outcome.text, source: 'ai' };
    warnFallback(outcome.reason);
    return fallback;
  } catch (error) {
    warnFallback(`error_${error instanceof Error ? error.name : 'unknown'}`);
    return fallback;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
