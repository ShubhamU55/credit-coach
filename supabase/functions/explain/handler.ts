// The request handler for the `explain` Edge Function, with its dependencies injected so it can
// be tested under Node with a mocked fetch. Contract with the app (apps/mobile/src/explain/client.ts):
//   request  POST, body = the engine's ExplainPayload JSON
//   response 200 { "text": string, "source": "ai" | "template" }
//   401 no session for a real user (the anon key alone is refused); 503 sign-in service unreachable;
//   429 over the rate limit (the model is not called); 400 invalid JSON or an unknown shape;
//   405 not POST; 413 body too large; 415 body not application/json.
// Anything that goes wrong after the input is accepted (no key, timeout, bad reply, numbers the
// payload does not contain) still answers 200 with the deterministic template and source "template".

import { askModel } from './anthropic.ts';
import type { AuthResult } from './auth.ts';
import { askGemini } from './gemini.ts';
import { isAcceptableAiText } from './grounding.ts';
import { validatePayload, type ExplainPayload } from './payload.ts';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt.ts';
import type { RateLimiter } from './ratelimit.ts';
import { templateFromPayload } from './template.ts';

/** The app rejects longer text, so neither the model's reply nor the template may exceed it. */
export const MAX_TEXT_LENGTH = 1500;
/** A full plan payload is a few KB; anything near this is not a plan. */
export const MAX_BODY_BYTES = 16 * 1024;

export interface ExplainDeps {
  /** From the function secret ANTHROPIC_API_KEY. With no provider key at all, template only. */
  apiKey: string | undefined;
  /** From the function secret GEMINI_API_KEY. When set, Gemini is used instead of Anthropic. */
  geminiApiKey?: string;
  /** From the optional function secret GEMINI_MODEL. */
  geminiModel?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  /** Resolves the caller to a real signed-in user (anonymous sign-in users included). */
  authenticate: (request: Request) => Promise<AuthResult>;
  /** Per user, and per network address when the gateway reports one. */
  userLimiter: RateLimiter;
  ipLimiter: RateLimiter;
}

const HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

/** Cuts at the last full sentence that fits; a template this long is far outside a normal plan. */
export function capText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const head = text.slice(0, MAX_TEXT_LENGTH);
  const cut = head.lastIndexOf('. ');
  return cut > 0 ? head.slice(0, cut + 1) : head;
}

// Control characters other than newline have no place in a short plain-English note.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/** The model's reply, or null when it is empty, too long, or contains control characters. */
function acceptable(text: string): string | null {
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH || CONTROL_CHARS.test(text)) return null;
  return text;
}

const template = (text: string, reason: string): Response => {
  // A code only: never the payload, the key, or the model's words.
  console.warn('explain fallback', reason);
  return json(200, { text: capText(text), source: 'template' });
};

async function readBody(request: Request): Promise<string | 'too_large'> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return 'too_large';
  const raw = await request.text();
  return new TextEncoder().encode(raw).length > MAX_BODY_BYTES ? 'too_large' : raw;
}

async function parsePayload(
  request: Request,
): Promise<{ payload: ExplainPayload } | { response: Response }> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { response: json(415, { error: 'unsupported_media_type' }) };
  }
  const raw = await readBody(request);
  if (raw === 'too_large') return { response: json(413, { error: 'payload_too_large' }) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { response: json(400, { error: 'invalid_json' }) };
  }
  const result = validatePayload(parsed);
  if (!result.ok) return { response: json(400, { error: 'invalid_payload', field: result.path }) };
  return { payload: result.value };
}

/**
 * The caller's network address as the platform saw it, used ONLY to bound abuse. Only
 * cf-connecting-ip is trusted outright: the gateway sets it. x-real-ip is NOT read: nothing here
 * proves the gateway overwrites it, so a client could mint a new key per request. Failing that, the
 * RIGHTMOST x-forwarded-for entry: it is the one the last trusted proxy appended, while everything to
 * its left is whatever the client chose to send, so the first entry is never used as a key. Null when
 * nothing usable is present (the per-user limit still applies).
 *
 * OWNER, after deploy: confirm the proxy hop count (that the rightmost entry really is the client as
 * the gateway saw it) and set the Anthropic spend cap as the backstop. Anonymous sign-in
 * (supabase/config.toml, enable_anonymous_sign_ins) lets one person mint many user ids, so this
 * in-memory per-address limit is the only bound on one person; see supabase/OWNER-STEPS.md.
 */
export function clientAddress(headers: Headers): string | null {
  const platform = headers.get('cf-connecting-ip')?.trim();
  if (platform) return platform;
  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  return hops.length > 0 ? (hops[hops.length - 1] ?? null) : null;
}

/** 429 when this user or address is over its limit; null otherwise. Runs before anything is read or paid for. */
function rateLimited(request: Request, userId: string, deps: ExplainDeps): Response | null {
  const ip = clientAddress(request.headers);
  const checks = [
    deps.userLimiter.take(userId),
    ip ? deps.ipLimiter.take(ip) : { ok: true as const },
  ];
  for (const check of checks) {
    if (!check.ok) {
      return json(429, { error: 'rate_limited' }, { 'retry-after': String(check.retryAfterSec) });
    }
  }
  return null;
}

export async function handleExplain(request: Request, deps: ExplainDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST')
    return json(405, { error: 'method_not_allowed' }, { allow: 'POST, OPTIONS' });

  const caller = await deps.authenticate(request);
  if (!caller.ok) {
    return caller.reason === 'unavailable'
      ? json(503, { error: 'auth_unavailable' })
      : json(401, { error: 'unauthenticated' });
  }
  const limited = rateLimited(request, caller.userId, deps);
  if (limited) return limited;

  const parsed = await parsePayload(request);
  if ('response' in parsed) return parsed.response;
  const { payload } = parsed;

  const fallback = templateFromPayload(payload);
  if (!deps.geminiApiKey && !deps.apiKey) return template(fallback, 'no_key');

  const prompt = {
    system: SYSTEM_PROMPT,
    user: buildUserMessage(payload, fallback),
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
  };
  const reply = deps.geminiApiKey
    ? await askGemini({ ...prompt, apiKey: deps.geminiApiKey, model: deps.geminiModel })
    : await askModel({ ...prompt, apiKey: deps.apiKey ?? '' });
  if (!reply.ok) return template(fallback, reply.reason);

  const text = acceptable(reply.text);
  if (text === null) return template(fallback, 'unusable_text');
  if (!isAcceptableAiText(text, payload)) return template(fallback, 'ungrounded_or_forbidden');

  return json(200, { text, source: 'ai' });
}
