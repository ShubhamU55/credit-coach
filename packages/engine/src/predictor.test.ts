import { describe, it, expect } from 'vitest';
import { predictScore, type PredictorInput } from './predictor';
import { DEFAULT_PREDICTOR_CONFIG, type PredictorWeights } from './predictor-config';

/** Aarav (docs/design.md §8): anchor CIBIL 724 on 2 Oct, today 21 Oct, 3 unsecured cards. */
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

/** Best value of every factor. */
const PERFECT: PredictorInput = {
  ...AARAV,
  onTimePayments: 120,
  overallUtilizationPct: 0,
  maxCardUtilizationPct: 0,
  hardInquiries6m: 0,
  hardInquiries12m: 0,
  oldestAccountMonths: 300,
  openAccounts: 10,
  securedAccounts: 2,
  unsecuredAccounts: 3,
};

/** Worst value of every factor. */
const WORST: PredictorInput = {
  ...AARAV,
  onTimePayments: 0,
  missedPayments: 12,
  overallUtilizationPct: 150,
  maxCardUtilizationPct: 150,
  hardInquiries6m: 12,
  hardInquiries12m: 12,
  oldestAccountMonths: 0,
  openAccounts: 0,
  securedAccounts: 0,
  unsecuredAccounts: 0,
};

/** The same input with the anchor removed (no bureau score yet). */
const withoutAnchor = (input: PredictorInput): PredictorInput => {
  const copy = { ...input };
  delete copy.anchor;
  return copy;
};

const width = (e: { low: number; high: number }): number => e.high - e.low;

describe('predictScore: Aarav demo fixture (docs/design.md §8)', () => {
  it('estimates 708-736 in the Good zone from the 724 anchor', () => {
    // Act
    const estimate = predictScore(AARAV);

    // Assert
    expect(estimate.low).toBe(708);
    expect(estimate.high).toBe(736);
    expect(estimate.band).toBe('Good');
    expect(estimate.isRoughBand).toBe(false);
  });

  it('estimates 724-752 after the plan with the 10% switch off', () => {
    const estimate = predictScore({
      ...AARAV,
      overallUtilizationPct: 15.3,
      maxCardUtilizationPct: 30,
    });
    expect([estimate.low, estimate.high]).toEqual([724, 752]);
  });

  it('estimates 731-759 after the plan with the 10% switch on, still Good', () => {
    const estimate = predictScore({
      ...AARAV,
      overallUtilizationPct: 7.3,
      maxCardUtilizationPct: 10,
    });
    expect([estimate.low, estimate.high]).toEqual([731, 759]);
    expect(estimate.band).toBe('Good');
  });

  it('gives the top 3 reasons with direction and the numbers behind them', () => {
    // Act
    const { reasons } = predictScore(AARAV);

    // Assert
    expect(reasons).toEqual([
      {
        factor: 'paymentHistory',
        direction: 'up',
        current: { onTimePayments: 36, missedPayments: 0 },
      },
      { factor: 'maxCardUtilization', direction: 'down', current: { pct: 81 } },
      { factor: 'overallUtilization', direction: 'down', current: { pct: 45 } },
    ]);
  });
});

describe('predictScore: range width and time since the anchor', () => {
  it('is 20 points wide on the anchor day', () => {
    expect(width(predictScore({ ...AARAV, today: '2026-10-02' }))).toBe(20);
  });

  it('widens as days pass since the anchor', () => {
    const at19 = width(predictScore(AARAV));
    const at100 = width(predictScore({ ...AARAV, today: '2027-01-10' }));
    expect(at19).toBe(28);
    expect(at100).toBe(60);
  });

  it('caps the width once the anchor is very old', () => {
    expect(width(predictScore({ ...AARAV, today: '2030-01-01' }))).toBe(120);
  });

  it('treats an anchor dated after today as fresh, not as a negative age', () => {
    expect(width(predictScore({ ...AARAV, today: '2026-09-01' }))).toBe(20);
  });

  it('handles a leap day anchor', () => {
    const estimate = predictScore({
      ...AARAV,
      anchor: { score: 724, date: '2028-02-29' },
      today: '2028-03-01',
    });
    expect(width(estimate)).toBe(20);
  });
});

describe('predictScore: clamping to 300-900', () => {
  it('slides the window under 900 instead of collapsing it', () => {
    // Act
    const estimate = predictScore({ ...PERFECT, anchor: { score: 900, date: '2026-10-21' } });

    // Assert
    expect(estimate.high).toBe(900);
    expect(estimate.low).toBe(880);
    expect(estimate.band).toBe('Excellent');
  });

  it('slides the window above 300 instead of collapsing it', () => {
    const estimate = predictScore({ ...WORST, anchor: { score: 300, date: '2026-10-21' } });
    expect(estimate.low).toBe(300);
    expect(estimate.high).toBe(320);
    expect(estimate.band).toBe('Poor');
  });

  it('clamps an out-of-range anchor score into 300-900', () => {
    const estimate = predictScore({ ...PERFECT, anchor: { score: 2000, date: '2026-10-21' } });
    expect(estimate.high).toBe(900);
    expect(estimate.low).toBe(880);
  });
});

describe('predictScore: no anchor gives a rough band', () => {
  it('returns the 50-point band containing the model score, labelled rough', () => {
    // Act
    const estimate = predictScore(withoutAnchor(AARAV));

    // Assert
    expect(estimate).toMatchObject({ low: 700, high: 749, band: 'Good', isRoughBand: true });
  });

  it('uses 850-900 for the top band and 300-349 for the bottom band', () => {
    expect(predictScore(withoutAnchor(PERFECT))).toMatchObject({
      low: 850,
      high: 900,
      band: 'Excellent',
    });
    expect(predictScore(withoutAnchor(WORST))).toMatchObject({ low: 300, high: 349, band: 'Poor' });
  });
});

describe('predictScore: never one exact score (non-negotiable 3)', () => {
  const ALLOWED_KEYS = new Set([
    'low',
    'high',
    'band',
    'reasons',
    'isRoughBand',
    'factor',
    'direction',
    'current',
    'previous',
    'onTimePayments',
    'missedPayments',
    'pct',
    'last6m',
    'last12m',
    'oldestAccountMonths',
    'count',
    'secured',
    'unsecured',
  ]);

  const collectKeys = (value: unknown, into: string[]): string[] => {
    if (Array.isArray(value)) value.forEach((v) => collectKeys(v, into));
    else if (value !== null && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        into.push(key);
        collectKeys(v, into);
      }
    }
    return into;
  };

  it('carries only a low-high range, a zone word and reasons, with low < high', () => {
    for (const input of [AARAV, PERFECT, WORST]) {
      const estimate = predictScore(input);
      expect(collectKeys(estimate, []).filter((k) => !ALLOWED_KEYS.has(k))).toEqual([]);
      expect(estimate.low).toBeLessThan(estimate.high);
    }
  });
});

describe('predictScore: weights and config', () => {
  it('normalises weights, so scaling them all gives the same estimate', () => {
    // Arrange
    const doubled = Object.fromEntries(
      Object.entries(DEFAULT_PREDICTOR_CONFIG.weights).map(([k, w]) => [k, w * 2]),
    ) as unknown as PredictorWeights;

    // Act / Assert
    expect(predictScore(AARAV, { ...DEFAULT_PREDICTOR_CONFIG, weights: doubled })).toEqual(
      predictScore(AARAV),
    );
  });

  it('documents default weights that total 100 (admin W2 rule)', () => {
    const total = Object.values(DEFAULT_PREDICTOR_CONFIG.weights).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('rejects negative or all-zero weights', () => {
    const zero = { ...DEFAULT_PREDICTOR_CONFIG.weights };
    for (const key of Object.keys(zero) as Array<keyof PredictorWeights>) zero[key] = 0;
    expect(() => predictScore(AARAV, { ...DEFAULT_PREDICTOR_CONFIG, weights: zero })).toThrow(
      RangeError,
    );
    const negative = { ...DEFAULT_PREDICTOR_CONFIG.weights, creditMix: -1 };
    expect(() => predictScore(AARAV, { ...DEFAULT_PREDICTOR_CONFIG, weights: negative })).toThrow(
      RangeError,
    );
  });

  it('lets a heavier utilization weight move the estimate', () => {
    const heavy = { ...DEFAULT_PREDICTOR_CONFIG.weights, maxCardUtilization: 60 };
    const estimate = predictScore(AARAV, { ...DEFAULT_PREDICTOR_CONFIG, weights: heavy });
    expect(estimate.low).toBeLessThan(708);
  });
});

describe('predictScore: input validation', () => {
  it('throws RangeError for a malformed or impossible date', () => {
    expect(() => predictScore({ ...AARAV, today: '21-10-2026' })).toThrow(RangeError);
    expect(() => predictScore({ ...AARAV, anchor: { score: 724, date: '2026-02-30' } })).toThrow(
      RangeError,
    );
  });

  it('throws RangeError for a non-finite number', () => {
    expect(() => predictScore({ ...AARAV, overallUtilizationPct: Number.NaN })).toThrow(RangeError);
    expect(() =>
      predictScore({ ...AARAV, anchor: { score: Number.POSITIVE_INFINITY, date: '2026-10-02' } }),
    ).toThrow(RangeError);
  });

  it('treats negative counts as zero', () => {
    expect(predictScore({ ...AARAV, missedPayments: -3, hardInquiries6m: -1 })).toEqual(
      predictScore({ ...AARAV, missedPayments: 0, hardInquiries6m: 0 }),
    );
  });

  it('counts a 12-month inquiry total below the 6-month one as the 6-month total', () => {
    expect(predictScore({ ...AARAV, hardInquiries6m: 2, hardInquiries12m: 0 })).toEqual(
      predictScore({ ...AARAV, hardInquiries6m: 2, hardInquiries12m: 2 }),
    );
  });

  it('gives a neutral payment score with no history at all', () => {
    const none = predictScore({ ...AARAV, onTimePayments: 0, missedPayments: 0 });
    const one = predictScore({ ...AARAV, onTimePayments: 1, missedPayments: 0 });
    expect(none.low).toBeLessThan(one.low);
  });
});
