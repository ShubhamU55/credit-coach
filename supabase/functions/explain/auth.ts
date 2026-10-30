// Who is calling? The `explain` function is for signed-in users only, anonymous sign-in users
// ("Try sample profile") included. The project's gateway already checks the token's signature
// (verify_jwt = true); this adds what the gateway cannot: the bare anon key is also a valid JWT, and
// it ships inside every copy of the app, so it must not be enough. A caller must hold a session
// token for a real user, which Supabase Auth confirms with one call. No dependencies.
// A failed lookup logs one line with a reason code only (never the token, a header or a body).

export type AuthResult =
  { ok: true; userId: string } | { ok: false; reason: 'unauthenticated' | 'unavailable' };

export interface AuthConfig {
  /** From the function environment (SUPABASE_URL, set by the Edge runtime). */
  supabaseUrl: string | undefined;
  /** From the function environment (SUPABASE_ANON_KEY, set by the Edge runtime). */
  anonKey: string | undefined;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

/**
 * Budget for the user lookup; with the model call it must fit inside the app's 5 s (see limits test).
 * 600 ms was too tight from a hosted edge function: the lookup timed out intermittently (503).
 */
export const AUTH_TIMEOUT_MS = 1500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  return match?.[1] ?? null;
}

/** The claims of a JWT, unverified: only used to turn away the anon key without a network call. */
function claimsOf(token: string): { role?: unknown; sub?: unknown } | null {
  try {
    const body = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const parsed: unknown = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '=')));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Drops trailing slashes with a plain scan: the regex form backtracks quadratically on long slash runs. */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

/** One line, reason code only: the log must never carry the token, a header or a response body. */
function unavailable(reason: 'timeout' | 'network' | 'no_config' | `http_${number}`): AuthResult {
  console.warn(`explain auth unavailable ${reason}`);
  return { ok: false, reason: 'unavailable' };
}

export async function authenticate(request: Request, config: AuthConfig): Promise<AuthResult> {
  const token = bearerToken(request);
  const claims = token ? claimsOf(token) : null;
  const sub = claims?.sub;
  if (!token || claims?.role !== 'authenticated' || typeof sub !== 'string' || !UUID.test(sub)) {
    return { ok: false, reason: 'unauthenticated' };
  }
  if (!config.supabaseUrl || !config.anonKey) return unavailable('no_config');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? AUTH_TIMEOUT_MS);
  try {
    const response = await config.fetchImpl(
      `${withoutTrailingSlashes(config.supabaseUrl)}/auth/v1/user`,
      {
        headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'unauthenticated' };
    }
    if (!response.ok) return unavailable(`http_${response.status}`);
    const user: unknown = await response.json();
    const id = typeof user === 'object' && user !== null ? (user as { id?: unknown }).id : null;
    return id === sub ? { ok: true, userId: sub } : { ok: false, reason: 'unauthenticated' };
  } catch {
    return unavailable(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}
