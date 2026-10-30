import { createClient } from '@supabase/supabase-js';

import type { BackendConfig } from './config';

/** The few supabase-js calls the app uses, so tests can fake them without the network. */
export interface BackendClient {
  auth: {
    signInAnonymously(): PromiseLike<{
      data: { session: { access_token: string } | null };
      error: unknown;
    }>;
    onAuthStateChange(
      callback: (event: string, session: { access_token: string } | null) => void,
    ): unknown;
  };
  from(table: 'coach_rules'): {
    select(columns: '*'): {
      eq(column: 'id', value: 1): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
}

let instance: BackendClient | null = null;

/**
 * The one Supabase client, created on first use (never at import, never without a config). The
 * session lives in memory only (`persistSession: false`): no storage module, so the generated
 * android/ project is unchanged. The token still refreshes while the app runs.
 */
export function getBackendClient(config: BackendConfig): BackendClient {
  if (!instance) {
    // supabase-js sets `url.protocol`, which React Native's built-in URL class cannot do (it has no
    // setter), so createClient throws on device without a spec URL. This is a pure-JS polyfill with
    // no native code. It is loaded only here, so an app with no backend config never touches the
    // global URL.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-url-polyfill/auto');
  }
  instance ??= createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  }) as unknown as BackendClient;
  return instance;
}

/** Drops the shared client (tests). */
export function resetBackendClient(): void {
  instance = null;
}
