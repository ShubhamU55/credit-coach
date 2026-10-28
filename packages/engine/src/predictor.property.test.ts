import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { predictScore, type PredictorInput, type ScoreEstimate } from './predictor';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH_2020 = Date.UTC(2020, 0, 1);
const isoFromDay = (day: number): string =>
  new Date(EPOCH_2020 + day * MS_PER_DAY).toISOString().slice(0, 10);

const utilPct = fc.oneof(
  fc.double({ min: -5, max: 35, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -20, max: 200, noNaN: true, noDefaultInfinity: true }),
);
/** A small non-negative step, so pairs land close together on every part of the curve. */
const step = fc.double({ min: 0, max: 15, noNaN: true, noDefaultInfinity: true });
const count = fc.integer({ min: 0, max: 60 });

/** Arbitrary predictor inputs, half with an anchor and half without (rough band mode). */
const inputArb: fc.Arbitrary<PredictorInput> = fc
  .record({
    hasAnchor: fc.boolean(),
    anchorScore: fc.integer({ min: 300, max: 900 }),
    anchorDay: fc.integer({ min: 0, max: 2000 }),
    daysSince: fc.integer({ min: -30, max: 1500 }),
    onTimePayments: fc.integer({ min: 0, max: 240 }),
    missedPayments: fc.integer({ min: 0, max: 24 }),
    overallUtilizationPct: utilPct,
    maxCardUtilizationPct: utilPct,
    hardInquiries6m: fc.integer({ min: 0, max: 12 }),
    olderInquiries: fc.integer({ min: 0, max: 12 }),
    oldestAccountMonths: fc.integer({ min: 0, max: 480 }),
    openAccounts: count,
    securedAccounts: fc.integer({ min: 0, max: 10 }),
    unsecuredAccounts: fc.integer({ min: 0, max: 10 }),
  })
  .map(({ hasAnchor, anchorScore, anchorDay, daysSince, olderInquiries, ...f }) => ({
    ...f,
    hardInquiries12m: f.hardInquiries6m + olderInquiries,
    today: isoFromDay(anchorDay + daysSince + 30),
    ...(hasAnchor ? { anchor: { score: anchorScore, date: isoFromDay(anchorDay + 30) } } : {}),
  }));

/** `a` is never below `b`, at either end of the range. */
const expectNotLower = (a: ScoreEstimate, b: ScoreEstimate): void => {
  expect(a.low).toBeGreaterThanOrEqual(b.low);
  expect(a.high).toBeGreaterThanOrEqual(b.high);
};

describe('predictScore properties (PRD §5.5 acceptance)', () => {
  // criterion: lower utilization never produces a lower estimate, all else equal
  it('lower overall utilization never gives a lower estimate', () => {
    fc.assert(
      fc.property(inputArb, utilPct, step, (input, lower, delta) => {
        const higher = lower + delta;
        expectNotLower(
          predictScore({ ...input, overallUtilizationPct: lower }),
          predictScore({ ...input, overallUtilizationPct: higher }),
        );
      }),
    );
  });

  it('lower max-card utilization never gives a lower estimate', () => {
    fc.assert(
      fc.property(inputArb, utilPct, step, (input, lower, delta) => {
        const higher = lower + delta;
        expectNotLower(
          predictScore({ ...input, maxCardUtilizationPct: lower }),
          predictScore({ ...input, maxCardUtilizationPct: higher }),
        );
      }),
    );
  });

  // criterion: adding a missed payment never raises the estimate
  it('a missed payment never raises the estimate', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const missed = { ...input, missedPayments: input.missedPayments + 1 };
        expectNotLower(predictScore(input), predictScore(missed));
      }),
    );
  });

  it('another hard inquiry never raises the estimate', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const applied = {
          ...input,
          hardInquiries6m: input.hardInquiries6m + 1,
          hardInquiries12m: input.hardInquiries12m + 1,
        };
        expectNotLower(predictScore(input), predictScore(applied));
      }),
    );
  });

  // criterion: clamped to 300-900, and never one exact score
  it('always returns an integer range inside 300-900 with low < high', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { low, high, reasons } = predictScore(input);
        expect(Number.isInteger(low) && Number.isInteger(high)).toBe(true);
        expect(low).toBeGreaterThanOrEqual(300);
        expect(high).toBeLessThanOrEqual(900);
        expect(high - low).toBeGreaterThanOrEqual(20);
        expect(reasons).toHaveLength(3);
      }),
    );
  });

  // criterion: the range widens as time passes since the anchor
  it('the range never narrows as more days pass since the anchor', () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.integer({ min: 0, max: 1500 }),
        fc.integer({ min: 0, max: 1500 }),
        (input, a, b) => {
          const anchor = { score: input.anchor?.score ?? 724, date: '2024-01-01' };
          const [sooner, later] = a <= b ? [a, b] : [b, a];
          const at = (days: number): number => {
            const e = predictScore({ ...input, anchor, today: isoFromDay(1461 + days) });
            return e.high - e.low;
          };
          expect(at(sooner)).toBeLessThanOrEqual(at(later));
        },
      ),
    );
  });

  it('is deterministic: the same input gives the same output', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(predictScore(input)).toEqual(predictScore({ ...input }));
      }),
    );
  });
});
