// The request handler for the `explain` Edge Function, with its dependencies injected so it can
// be tested under Node with a mocked fetch. Contract with the app (apps/mobile/src/explain/client.ts):
//   request  POST, body = the engine's ExplainPayload JSON
//   response 200 { "text": string, "source": "ai" | "template" }
//   400 invalid JSON or an unknown shape; 405 not POST; 413 body too large.
// Anything that goes wrong after the input is accepted (no key, timeout, bad reply, numbers the
// payload does not contain) still answers 200 with the deterministic template and source "template".

import { askModel } from './anthropic.ts';
import { isGrounded } from './ground.ts';
import { validatePayload, type ExplainPayload } from './payload.ts';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt.ts';
import { templateFromPayload } from './template.ts';

/** The app rejects longer text, so neither the model's reply nor the template may exceed it. */
export const MAX_TEXT_LENGTH = 1500;
/** A full plan payload is a few KB; anything near this is not a plan. */
export const MAX_BODY_BYTES = 16 * 1024;

export interface ExplainDeps {
  /** From the function secret ANTHROPIC_API_KEY. Absent means template only. */
  apiKey: string | undefined;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
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

export async function handleExplain(request: Request, deps: ExplainDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST')
    return json(405, { error: 'method_not_allowed' }, { allow: 'POST, OPTIONS' });

  const parsed = await parsePayload(request);
  if ('response' in parsed) return parsed.response;
  const { payload } = parsed;

  const fallback = templateFromPayload(payload);
  if (!deps.apiKey) return template(fallback, 'no_key');

  const reply = await askModel({
    apiKey: deps.apiKey,
    system: SYSTEM_PROMPT,
    user: buildUserMessage(payload, fallback),
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs,
  });
  if (!reply.ok) return template(fallback, reply.reason);

  const text = acceptable(reply.text);
  if (text === null) return template(fallback, 'unusable_text');
  if (!isGrounded(text, payload)) return template(fallback, 'ungrounded_numbers');

  return json(200, { text, source: 'ai' });
}
