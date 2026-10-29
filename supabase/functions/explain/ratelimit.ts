// A small fixed-window rate limiter, kept in memory.
//
// BEST EFFORT ONLY: each Edge Function instance has its own counters, they reset when an instance
// is recycled, and several instances can run at once, so the real ceiling is a few times the
// configured number. It stops a loop or a casual abuser, not a determined one. The durable option is
// a Postgres counter (a `rate_limits` table plus an RPC called with the service role); see
// supabase/OWNER-STEPS.md. An Anthropic spend cap is the backstop either way.

export type Take = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  take(key: string): Take;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now: () => number;
  /** Bounds memory: expired entries are dropped first, then the oldest. */
  maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { max, windowMs, now } = options;
  const maxKeys = options.maxKeys ?? 5000;
  const windows = new Map<string, { start: number; count: number }>();

  function prune(at: number): void {
    for (const [key, entry] of windows) {
      if (at - entry.start >= windowMs) windows.delete(key);
    }
    while (windows.size > maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  return {
    take(key: string): Take {
      const at = now();
      const entry = windows.get(key);
      if (!entry || at - entry.start >= windowMs) {
        windows.delete(key);
        windows.set(key, { start: at, count: 1 });
        if (windows.size > maxKeys) prune(at);
        return { ok: true };
      }
      if (entry.count >= max) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.start + windowMs - at) / 1000)) };
      }
      entry.count += 1;
      return { ok: true };
    },
  };
}

/** Per signed-in user: a person opens the plan a few times a minute at most. */
export const USER_LIMIT_PER_MINUTE = 10;
/** Per network address: looser, because anonymous sign-in lets one person hold several user ids. */
export const IP_LIMIT_PER_MINUTE = 30;
