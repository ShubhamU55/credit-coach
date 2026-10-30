import { cache } from 'react';
import { cookies } from 'next/headers';
import { supabaseFor } from './supabase';

export const SESSION_COOKIE = 'cc_admin_token';

export type Session = { token: string; userId: string; email: string; isAdmin: boolean };

/**
 * The signed-in user, or null. The access token lives in an httpOnly cookie and is checked with
 * Supabase Auth on every request (never decoded and trusted locally). The admin flag comes from
 * app_metadata, which only the service role can write; user_metadata is never read.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await supabaseFor(token).auth.getUser(token);
  if (error || !data.user) return null;
  const role: unknown = data.user.app_metadata?.role;
  return {
    token,
    userId: data.user.id,
    email: data.user.email ?? '',
    isAdmin: role === 'admin' && data.user.is_anonymous !== true,
  };
});
