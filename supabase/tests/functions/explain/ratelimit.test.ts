import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../../functions/explain/ratelimit.ts';

const clock = (start = 1_000_000) => {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

describe('createRateLimiter', () => {
  it('allows max calls in a window, then refuses with a retry delay', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock().now });

    const results = [1, 2, 3, 4].map(() => limiter.take('u'));

    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3]).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it('counts each key on its own', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock().now });

    expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a').ok).toBe(false);
    expect(limiter.take('b').ok).toBe(true);
  });

  it('opens a fresh window once the old one has passed, and shrinks the retry delay as time goes', () => {
    const c = clock();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: c.now });
    limiter.take('u');

    c.advance(45_000);
    expect(limiter.take('u')).toEqual({ ok: false, retryAfterSec: 15 });
    c.advance(15_000);
    expect(limiter.take('u').ok).toBe(true);
    expect(limiter.take('u').ok).toBe(false);
  });

  it('refuses the N+1th call exactly at the limit for any max', () => {
    for (const max of [1, 2, 10, 30]) {
      const limiter = createRateLimiter({ max, windowMs: 60_000, now: clock().now });
      const accepted = Array.from({ length: max + 3 }, () => limiter.take('u')).filter((r) => r.ok);
      expect(accepted).toHaveLength(max);
    }
  });

  it('keeps memory bounded when many keys arrive', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock().now, maxKeys: 50 });

    for (let i = 0; i < 500; i += 1) limiter.take(`key-${i}`);

    // The oldest keys were forgotten (best effort); the newest still count.
    expect(limiter.take('key-499').ok).toBe(false);
    expect(limiter.take('key-0').ok).toBe(true);
  });
});
