import { describe, it, expect } from 'vitest';
import { predictScore, type PredictorInput } from './predictor';
import {
  DEFAULT_PREDICTOR_CONFIG,
  validatePredictorConfig,
  type Curve,
  type PredictorConfig,
} from './predictor-config';

/** Aarav (docs/design.md §8), on the anchor day so the range is at its narrowest. */
const AARAV_ON_ANCHOR_DAY: PredictorInput = {
  anchor: { score: 724, date: '2026-10-02' },
  today: '2026-10-02',
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

const D = DEFAULT_PREDICTOR_CONFIG;
const withRange = (range: Partial<PredictorConfig['range']>): PredictorConfig => ({
  ...D,
  range: { ...D.range, ...range },
});
const withCurve = (name: keyof PredictorConfig['curves'], curve: Curve): PredictorConfig => ({
  ...D,
  curves: { ...D.curves, [name]: curve },
});

/** Each bad config, the field its error must name, and why it is bad. */
const BAD_CONFIGS: Array<[string, PredictorConfig, string]> = [
  [
    'zero half-width (gave 734-734)',
    withRange({ baseHalfWidth: 0, widenPerDay: 0 }),
    'range.baseHalfWidth',
  ],
  [
    'negative half-width (gave low > high)',
    withRange({ baseHalfWidth: -5 }),
    'range.baseHalfWidth',
  ],
  ['non-finite half-width', withRange({ baseHalfWidth: Number.NaN }), 'range.baseHalfWidth'],
  [
    'negative widening (inverted at 59 days)',
    withRange({ widenPerDay: -0.2 }),
    'range.widenPerDay',
  ],
  ['infinite widening', withRange({ widenPerDay: Number.POSITIVE_INFINITY }), 'range.widenPerDay'],
  ['cap below base', withRange({ baseHalfWidth: 10, maxHalfWidth: 5 }), 'range.maxHalfWidth'],
  ['non-finite cap', withRange({ maxHalfWidth: Number.NaN }), 'range.maxHalfWidth'],
  ['rough band 0 (gave NaN)', { ...D, roughBandWidth: 0 }, 'roughBandWidth'],
  ['rough band 1 (gave one exact score)', { ...D, roughBandWidth: 1 }, 'roughBandWidth'],
  ['fractional rough band', { ...D, roughBandWidth: 2.5 }, 'roughBandWidth'],
  ['rough band wider than the scale', { ...D, roughBandWidth: 601 }, 'roughBandWidth'],
  ['modelShare NaN (gave NaN)', { ...D, modelShare: Number.NaN }, 'modelShare'],
  ['modelShare 0', { ...D, modelShare: 0 }, 'modelShare'],
  ['modelShare above 1', { ...D, modelShare: 1.5 }, 'modelShare'],
  ['negative missed-payment penalty', { ...D, missedPaymentPenalty: -0.4 }, 'missedPaymentPenalty'],
  [
    'no-history subscore above 1',
    { ...D, noHistoryPaymentSubscore: 2 },
    'noHistoryPaymentSubscore',
  ],
  ['negative older-inquiry factor', { ...D, olderInquiryFactor: -1 }, 'olderInquiryFactor'],
  [
    'credit mix above 1',
    { ...D, creditMixSubscores: { both: 1.5, single: 0.5, none: 0 } },
    'creditMixSubscores.both',
  ],
  [
    'credit mix NaN',
    { ...D, creditMixSubscores: { both: 1, single: Number.NaN, none: 0 } },
    'creditMixSubscores.single',
  ],
  [
    'credit mix negative',
    { ...D, creditMixSubscores: { both: 1, single: 0.5, none: -0.1 } },
    'creditMixSubscores.none',
  ],
  ['empty curve', withCurve('creditAge', []), 'curves.creditAge'],
  [
    'non-finite curve point',
    withCurve('openAccounts', [
      [0, 0],
      [Number.NaN, 1],
    ]),
    'curves.openAccounts',
  ],
  [
    'curve inputs not increasing',
    withCurve('creditAge', [
      [0, 0],
      [12, 0.5],
      [12, 0.6],
    ]),
    'curves.creditAge',
  ],
  [
    'curve subscore above 1',
    withCurve('creditAge', [
      [0, 0],
      [12, 1.2],
    ]),
    'curves.creditAge',
  ],
  [
    'utilization curve rising',
    withCurve('overallUtilization', [
      [0, 1],
      [30, 0.6],
      [40, 0.68],
      [100, 0],
    ]),
    'curves.overallUtilization',
  ],
  [
    'max-card curve rising',
    withCurve('maxCardUtilization', [
      [0, 0.5],
      [100, 0.6],
    ]),
    'curves.maxCardUtilization',
  ],
  [
    'inquiry curve rising',
    withCurve('hardInquiries', [
      [0, 0.5],
      [3, 0.9],
    ]),
    'curves.hardInquiries',
  ],
  [
    'credit age curve falling',
    withCurve('creditAge', [
      [0, 1],
      [120, 0.5],
    ]),
    'curves.creditAge',
  ],
  [
    'open accounts curve falling',
    withCurve('openAccounts', [
      [0, 1],
      [5, 0.2],
    ]),
    'curves.openAccounts',
  ],
  ['no zones', { ...D, zones: [] }, 'zones'],
  ['non-finite zone', { ...D, zones: [{ label: 'Poor', min: Number.NaN }] }, 'zones'],
];

describe('validatePredictorConfig', () => {
  it('accepts the documented defaults', () => {
    expect(() => validatePredictorConfig(DEFAULT_PREDICTOR_CONFIG)).not.toThrow();
  });

  it.each(BAD_CONFIGS)('rejects %s with a RangeError naming the field', (_why, config, field) => {
    expect(() => validatePredictorConfig(config)).toThrow(RangeError);
    expect(() => validatePredictorConfig(config)).toThrow(field);
  });

  it.each(BAD_CONFIGS)(
    'predictScore refuses %s instead of returning a broken range',
    (_w, config) => {
      expect(() => predictScore(AARAV_ON_ANCHOR_DAY, config)).toThrow(RangeError);
    },
  );

  it('accepts the narrowest valid settings and still returns low < high', () => {
    // Arrange
    const narrow: PredictorConfig = {
      ...withRange({ baseHalfWidth: 1, widenPerDay: 0, maxHalfWidth: 1 }),
      modelShare: 1,
      roughBandWidth: 2,
    };
    const { anchor: _unused, ...noAnchor } = AARAV_ON_ANCHOR_DAY;
    void _unused;

    // Act
    const anchored = predictScore(AARAV_ON_ANCHOR_DAY, narrow);
    const rough = predictScore(noAnchor, narrow);

    // Assert
    expect(anchored.high - anchored.low).toBe(2);
    expect(rough.low).toBeLessThan(rough.high);
  });
});

describe('default curves are monotone point to point', () => {
  const nonIncreasing = ['overallUtilization', 'maxCardUtilization', 'hardInquiries'] as const;
  const nonDecreasing = ['creditAge', 'openAccounts'] as const;
  const steps = (curve: Curve): Array<[number, number]> =>
    curve.slice(1).map((p, i) => [(curve[i] as readonly [number, number])[1], p[1]]);

  it.each(nonIncreasing)('%s never rises as the input grows', (name) => {
    for (const [from, to] of steps(DEFAULT_PREDICTOR_CONFIG.curves[name])) {
      expect(to).toBeLessThanOrEqual(from);
    }
  });

  it.each(nonDecreasing)('%s never falls as the input grows', (name) => {
    for (const [from, to] of steps(DEFAULT_PREDICTOR_CONFIG.curves[name])) {
      expect(to).toBeGreaterThanOrEqual(from);
    }
  });
});
