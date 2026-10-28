import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkApplicationGuard, DEFAULT_GUARD_CONFIG } from './guard';
import type { PredictorInput } from './predictor';

/** Aarav (docs/design.md §8): 1 hard inquiry in the last 6 months. */
const AARAV: PredictorInput = {
  anchor: { score: 724, date: '2026-10-02' },
  today: '2026-10-21',
  onTimePayments: 36,
  missedPayments: 0,
  overallUtilizationPct: 45,
  maxCardUtilizationPct: 81,
  hardInquiries6m: 1,
  hardInquiries12m: 1,
  oldestAccountMonths: 74,
  openAccounts: 3,
  securedAccounts: 0,
  unsecuredAccounts: 3,
};

/** Rohan (IA edge persona): 2 hard inquiries in 6 months, so the guard fires. */
const ROHAN: PredictorInput = {
  ...AARAV,
  anchor: { score: 650, date: '2026-10-02' },
  onTimePayments: 30,
  missedPayments: 1,
  overallUtilizationPct: 60,
  maxCardUtilizationPct: 90,
  hardInquiries6m: 2,
  hardInquiries12m: 2,
  oldestAccountMonths: 40,
};

describe('checkApplicationGuard (PRD §5.6)', () => {
  it('does not warn below N hard inquiries in 6 months, and still shows the impact', () => {
    // Act
    const result = checkApplicationGuard(AARAV);

    // Assert
    expect(result.shouldWarn).toBe(false);
    expect(result.hardInquiries6m).toBe(1);
    expect(result.threshold).toBe(2);
    expect(result.impact).toEqual({ pointsLow: 4, pointsHigh: 12 });
  });

  it('warns at N (default 2) hard inquiries in the last 6 months', () => {
    const result = checkApplicationGuard(ROHAN);
    expect(result.shouldWarn).toBe(true);
    expect(result.impact.pointsLow).toBeGreaterThan(0);
  });

  it('uses a configurable N', () => {
    const strict = checkApplicationGuard(AARAV, { ...DEFAULT_GUARD_CONFIG, minHardInquiries6m: 1 });
    const loose = checkApplicationGuard(ROHAN, { ...DEFAULT_GUARD_CONFIG, minHardInquiries6m: 3 });
    expect(strict.shouldWarn).toBe(true);
    expect(loose.shouldWarn).toBe(false);
  });

  it('counts only the last 6 months, not older inquiries', () => {
    const result = checkApplicationGuard({ ...AARAV, hardInquiries6m: 1, hardInquiries12m: 5 });
    expect(result.shouldWarn).toBe(false);
  });

  it('shows the estimate before and after one more hard inquiry', () => {
    const { estimateBefore, estimateAfter } = checkApplicationGuard(AARAV);
    expect([estimateBefore.low, estimateBefore.high]).toEqual([708, 736]);
    expect([estimateAfter.low, estimateAfter.high]).toEqual([704, 732]);
  });

  it('rejects an N below 1 or not a whole number', () => {
    expect(() =>
      checkApplicationGuard(AARAV, { ...DEFAULT_GUARD_CONFIG, minHardInquiries6m: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      checkApplicationGuard(AARAV, { ...DEFAULT_GUARD_CONFIG, minHardInquiries6m: 1.5 }),
    ).toThrow(RangeError);
  });

  it('rejects an impact spread that is negative or inverted', () => {
    expect(() =>
      checkApplicationGuard(AARAV, { ...DEFAULT_GUARD_CONFIG, impactSpread: { low: 2, high: 1 } }),
    ).toThrow(RangeError);
    expect(() =>
      checkApplicationGuard(AARAV, { ...DEFAULT_GUARD_CONFIG, impactSpread: { low: -1, high: 1 } }),
    ).toThrow(RangeError);
  });

  it('always gives an impact range with 0 <= low < high, and never a higher estimate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 300, max: 900 }),
        (inquiries6m, older, anchorScore) => {
          // Arrange
          const input = {
            ...AARAV,
            anchor: { score: anchorScore, date: '2026-10-02' },
            hardInquiries6m: inquiries6m,
            hardInquiries12m: inquiries6m + older,
          };

          // Act
          const { impact, estimateBefore, estimateAfter, shouldWarn } =
            checkApplicationGuard(input);

          // Assert
          expect(impact.pointsLow).toBeGreaterThanOrEqual(0);
          expect(impact.pointsLow).toBeLessThan(impact.pointsHigh);
          expect(estimateAfter.low).toBeLessThanOrEqual(estimateBefore.low);
          expect(estimateAfter.high).toBeLessThanOrEqual(estimateBefore.high);
          expect(shouldWarn).toBe(inquiries6m >= 2);
        },
      ),
    );
  });
});
