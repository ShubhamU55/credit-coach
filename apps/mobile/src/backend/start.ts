import type { DemoRepository } from '../demo/types';
import { getBackendClient, type BackendClient } from './client';
import { backendConfigFromExpoEnv, type BackendConfig } from './config';
import { parseCoachRulesRow, toDemoRules, type CoachRulesRow } from './rules';
import { setAccessToken } from './session';

/** Each network step gets this long; the UI never waits for it. */
export const BACKEND_TIMEOUT_MS = 3000;

/** Why the backend was skipped. Codes only: never a token, a key or a response body. */
type SkipReason =
  | 'client_failed'
  | 'signin_timeout'
  | 'signin_failed'
  | 'rules_timeout'
  | 'rules_failed'
  | 'rules_invalid';

function warnSkipped(reason: SkipReason): void {
  if (!__DEV__) return;
  console.warn('backend skipped', reason);
}

const TIMED_OUT = Symbol('timed out');

async function within<T>(work: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([Promise.resolve(work), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface StartBackendOptions {
  repository: Pick<DemoRepository, 'getRules' | 'applyRules'>;
  /** Defaults to the EXPO_PUBLIC_* values. Null means no backend at all. */
  config?: BackendConfig | null;
  getClient?: (config: BackendConfig) => BackendClient;
  timeoutMs?: number;
}

const started = new WeakSet<object>();

/** Anonymous sign-in; the token goes to memory only. Null (with a reason logged) on any failure. */
async function signIn(client: BackendClient, timeoutMs: number): Promise<boolean> {
  // Keeps the in-memory token current across refreshes and sign-outs.
  client.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token));
  const result = await within(client.auth.signInAnonymously(), timeoutMs);
  if (result === TIMED_OUT) return skip('signin_timeout');
  if (result.error || !result.data.session) return skip('signin_failed');
  setAccessToken(result.data.session.access_token);
  return true;
}

async function fetchRules(client: BackendClient, timeoutMs: number): Promise<CoachRulesRow | null> {
  const result = await within(
    client.from('coach_rules').select('*').eq('id', 1).maybeSingle(),
    timeoutMs,
  );
  if (result === TIMED_OUT) return skipNull('rules_timeout');
  if (result.error || !result.data) return skipNull('rules_failed');
  return parseCoachRulesRow(result.data) ?? skipNull('rules_invalid');
}

function skip(reason: SkipReason): false {
  warnSkipped(reason);
  return false;
}

function skipNull(reason: SkipReason): null {
  warnSkipped(reason);
  return null;
}

function createClient(options: StartBackendOptions, config: BackendConfig): BackendClient | null {
  try {
    return (options.getClient ?? getBackendClient)(config);
  } catch {
    return skipNull('client_failed');
  }
}

/**
 * The network enhancement, run in the background after start: sign in anonymously, then fetch the
 * single coach_rules row and apply it to the repository so Home, Plan and Score recompute. It never
 * throws and never waits on the UI: no config, no network, a slow answer or an invalid row all leave
 * the seed rules exactly as they were. Runs once per repository.
 */
export async function startBackend(options: StartBackendOptions): Promise<void> {
  const { repository } = options;
  const config = options.config === undefined ? backendConfigFromExpoEnv() : options.config;
  if (!config || started.has(repository)) return;
  started.add(repository);
  const timeoutMs = options.timeoutMs ?? BACKEND_TIMEOUT_MS;

  try {
    const client = createClient(options, config);
    if (!client || !(await signIn(client, timeoutMs))) return;
    const row = await fetchRules(client, timeoutMs);
    if (row) repository.applyRules(toDemoRules(row, repository.getRules()));
  } catch {
    warnSkipped('rules_failed');
  }
}
