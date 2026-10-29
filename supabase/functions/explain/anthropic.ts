// One call to the Anthropic Messages API with a hard wall-clock limit. It never throws: every
// failure comes back as a short reason code. Nothing here logs the key, the prompt or the reply.

export const MODEL = 'claude-haiku-4-5';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
/** The ticket's hard limit for the whole model call, headers and body included. */
export const MODEL_TIMEOUT_MS = 3000;
/** A few sentences; also bounds cost per request. */
const MAX_OUTPUT_TOKENS = 400;

export type ModelResult = { ok: true; text: string } | { ok: false; reason: string };

export interface ModelRequest {
  apiKey: string;
  system: string;
  user: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

/** Joins the text blocks of a Messages API reply; null when the reply is not a finished text answer. */
function textOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { content, stop_reason: stopReason } = body as Record<string, unknown>;
  // A reply cut off by the token limit ends mid-sentence: not usable.
  if (stopReason === 'max_tokens' || !Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      const { type, text } = block as Record<string, unknown>;
      if (type === 'text' && typeof text === 'string') parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join('').trim() : null;
}

async function callModel(request: ModelRequest, signal: AbortSignal): Promise<ModelResult> {
  try {
    const response = await request.fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      }),
      signal,
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const text = textOf(await response.json());
    return text === null ? { ok: false, reason: 'bad_reply' } : { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
    };
  }
}

/**
 * Asks the model, giving up after `timeoutMs` (default 3 s). The abort signal cancels a real
 * request; the race makes the limit hold even if a fetch implementation ignores the signal.
 */
export async function askModel(request: ModelRequest): Promise<ModelResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ModelResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'timeout' });
    }, request.timeoutMs ?? MODEL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([callModel(request, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
