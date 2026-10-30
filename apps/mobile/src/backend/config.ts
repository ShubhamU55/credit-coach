export interface BackendConfig {
  url: string;
  /** Public by design (row-level security guards the data). Never logged. */
  anonKey: string;
}

/**
 * The Supabase project the app may talk to. Both values are needed and the URL must be https;
 * anything else means "no backend": no client is created and no call is made, so the app runs
 * exactly as the offline demo.
 */
export function readBackendConfig(env: {
  url?: string | undefined;
  anonKey?: string | undefined;
}): BackendConfig | null {
  const url = env.url?.trim().replace(/\/+$/, '');
  const anonKey = env.anonKey?.trim();
  if (!url || !anonKey || !/^https:\/\/[^/\s]+/.test(url)) return null;
  return { url, anonKey };
}

/** Expo only inlines `process.env.EXPO_PUBLIC_*` when written out literally, so keep it explicit. */
export function backendConfigFromExpoEnv(): BackendConfig | null {
  return readBackendConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}
