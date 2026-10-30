import { createClient } from '@supabase/supabase-js';

/**
 * A server-side Supabase client. With a token, every request runs as that signed-in user, so
 * row-level security decides what it may read and write. Only the public URL and anon key are
 * used; there is no service-role key anywhere in this app.
 */
export function supabaseFor(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
}
