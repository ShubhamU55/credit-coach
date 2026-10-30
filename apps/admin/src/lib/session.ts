import { cache } from 'react';
import { cookies } from 'next/headers';
import { supabaseFor } from './supabase';

export const SESSION_COOKIE = 'cc_admin_token';

export type Session = { token: string; userId: string; email: string; isAdmin: boolean };

/** none = signed out (no cookie, or Supabase said the token is not valid); unavailable = we could not tell. */
export type SessionState =
  { kind: 'none' } | { kind: 'unavailable' } | { kind: 'ok'; session: Session };

const AUTH_ERROR_CODES = new Set([
  'bad_jwt',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'no_authorization',
]);

/** True only when Supabase Auth itself says the token is not (or no longer) valid. */
export function isAuthRejection(error: { status?: number; code?: string; name?: string }): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.name === 'AuthSessionMissingError' ||
    (error.code !== undefined && AUTH_ERROR_CODES.has(error.code))
  );
}

type UserResult = Awaited<ReturnType<ReturnType<typeof supabaseFor>['auth']['getUser']>>;

function toState(token: string, { data, error }: UserResult): SessionState {
  if (error) {
    if (isAuthRejection(error)) return { kind: 'none' };
    // Next aborts fetches that outlive a prerender with this message; the result is discarded, so it is not a real outage.
    if (!error.message.includes('During prerendering')) {
      console.error('[admin] session check failed', error.name, error.status, error.code);
    }
    return { kind: 'unavailable' };
  }
  if (!data.user) return { kind: 'none' };
  const role: unknown = data.user.app_metadata?.role;
  return {
    kind: 'ok',
    session: {
      token,
      userId: data.user.id,
      email: data.user.email ?? '',
      isAdmin: role === 'admin' && data.user.is_anonymous !== true,
    },
  };
}

/**
 * The signed-in user. The access token lives in an httpOnly cookie and is checked with Supabase
 * Auth on every request (never decoded and trusted locally). The admin flag comes from
 * app_metadata, which only the service role can write; user_metadata is never read. Only an auth
 * rejection means "signed out"; any other failure is logged and reported as "unavailable".
 */
export const getSession = cache(async (): Promise<SessionState> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { kind: 'none' };
  try {
    return toState(token, await supabaseFor(token).auth.getUser(token));
  } catch (e) {
    console.error('[admin] session check threw', e instanceof Error ? e.message : 'unknown');
    return { kind: 'unavailable' };
  }
});
