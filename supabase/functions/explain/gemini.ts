// One call to the Gemini generateContent API with a hard wall-clock limit. Same contract as
// anthropic.ts: it never throws, every failure is a short reason code, and nothing here logs the
// key, the prompt or the reply. The key goes in a header, never in the URL, so it cannot end up in
// a request log.

import { withDeadline, type ModelResult } from './anthropic.ts';

/**
 * A lite model on purpose: it answered in about 0.7 s on a free-tier key, while gemini-3.8-flash took
 * 14.6 s (the call is cut off at 2.5 s). gemini-2.5-flash is retired (404). Overridable with the
 * function secret GEMINI_MODEL, so a retired model id needs no redeploy of code.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
/** A few sentences; also bounds cost per request. */
const MAX_OUTPUT_TOKENS = 400;

export interface GeminiRequest {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

/** Joins the text parts of the first candidate; null unless it is a finished (STOP) answer. */
function textOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const candidate = (body as { candidates?: unknown }).candidates;
  const first: unknown = Array.isArray(candidate) ? candidate[0] : null;
  if (typeof first !== 'object' || first === null) return null;
  const { finishReason, content } = first as { finishReason?: unknown; content?: unknown };
  // MAX_TOKENS ends mid-sentence, SAFETY and the like are refusals: neither is usable.
  if (finishReason !== 'STOP') return null;
  const parts: unknown =
    typeof content === 'object' && content !== null ? (content as { parts?: unknown }).parts : null;
  if (!Array.isArray(parts)) return null;
  const texts: string[] = [];
  for (const part of parts) {
    const text =
      typeof part === 'object' && part !== null ? (part as { text?: unknown }).text : null;
    if (typeof text === 'string') texts.push(text);
  }
  const joined = texts.join('').trim();
  return joined.length > 0 ? joined : null;
}

const ERROR_STATUS = /^[A-Z_]{3,40}$/;

/**
 * `http_<status>`, plus Google's enumerated error.status lower-cased when the body has a well-formed
 * one (e.g. `http_404_not_found`). error.message can echo the input, so it is never copied.
 */
async function failureReason(response: Response): Promise<string> {
  const plain = `http_${response.status}`;
  try {
    const body: unknown = await response.json();
    const error =
      typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null;
    const status =
      typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : null;
    return typeof status === 'string' && ERROR_STATUS.test(status)
      ? `${plain}_${status.toLowerCase()}`
      : plain;
  } catch {
    return plain;
  }
}

async function callGemini(request: GeminiRequest, signal: AbortSignal): Promise<ModelResult> {
  try {
    const response = await request.fetchImpl(
      `${GEMINI_BASE_URL}/${request.model ?? GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // No thinkingConfig: gemini-3.x lite models reject thinkingBudget with a 400 and do not
            // think by default. A thinking model set through GEMINI_MODEL may hit MAX_TOKENS and
            // fall back to the template (bad_reply).
          },
        }),
        signal,
      },
    );
    if (!response.ok) return { ok: false, reason: await failureReason(response) };
    const text = textOf(await response.json());
    return text === null ? { ok: false, reason: 'bad_reply' } : { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
    };
  }
}

/** Asks Gemini, giving up after `timeoutMs` (default 2.5 s). */
export function askGemini(request: GeminiRequest): Promise<ModelResult> {
  return withDeadline((signal) => callGemini(request, signal), request.timeoutMs);
}
