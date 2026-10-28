/**
 * Score predictor rules table (PRD §5.5). Rules, not ML: every number below is a documented,
 * admin-adjustable default (PRD §6), and none of it is CIBIL's real (proprietary, F6) model.
 *
 * The defaults are calibrated to the Aarav demo fixture (docs/design.md §8), so his inputs give
 * 708–736 now, 724–752 after the plan, and 731–759 with "Aim for 10% utilization" on.
 */

/** The seven factors of PRD §5.5, in a fixed order (also the reason tie-break order). */
export type ScoreFactor =
  | 'paymentHistory'
  | 'overallUtilization'
  | 'maxCardUtilization'
  | 'hardInquiries'
  | 'creditAge'
  | 'openAccounts'
  | 'creditMix';

export const SCORE_FACTORS: readonly ScoreFactor[] = [
  'paymentHistory',
  'overallUtilization',
  'maxCardUtilization',
  'hardInquiries',
  'creditAge',
  'openAccounts',
  'creditMix',
];

/** The factor inputs, as primitives so the predictor doesn't depend on the card model. */
export interface FactorInputs {
  /** On-time monthly payments in the history (bureau DPD plus in-app payments). */
  onTimePayments: number;
  missedPayments: number;
  /** Σ outstanding ÷ Σ limit, in percent (may exceed 100 when over limit). */
  overallUtilizationPct: number;
  /** Highest single-card utilization, in percent. */
  maxCardUtilizationPct: number;
  /** Hard inquiries only. Self-checks are soft and never count (F1). */
  hardInquiries6m: number;
  /** Includes the last 6 months; a smaller value is read as equal to `hardInquiries6m`. */
  hardInquiries12m: number;
  oldestAccountMonths: number;
  openAccounts: number;
  securedAccounts: number;
  unsecuredAccounts: number;
}

/** Relative factor weights. Normalised by their sum, so they need not total exactly 100. */
export type PredictorWeights = Record<ScoreFactor, number>;

/** Piecewise-linear curve of `[input, subscore 0–1]` points, sorted by input. Flat past the ends. */
export type Curve = ReadonlyArray<readonly [x: number, subscore: number]>;

/** A zone on the score bar. A score belongs to the last zone whose `min` it reaches. */
export interface ScoreZone {
  label: string;
  min: number;
}

export interface PredictorConfig {
  weights: PredictorWeights;
  /**
   * Share of the gap between the rules model and the anchor that the estimate moves (0–1].
   * The bureau's real anchor score dominates, and the model nudges it.
   */
  modelShare: number;
  /** Subscore lost per missed payment, on top of the on-time ratio. */
  missedPaymentPenalty: number;
  /** Payment subscore with no history at all (thin file): neutral. */
  noHistoryPaymentSubscore: number;
  /** Weight of an inquiry from 7–12 months ago, relative to one in the last 6 months. */
  olderInquiryFactor: number;
  curves: {
    overallUtilization: Curve;
    maxCardUtilization: Curve;
    /** Input: effective inquiries = last 6 months + `olderInquiryFactor` × months 7–12. */
    hardInquiries: Curve;
    creditAge: Curve;
    openAccounts: Curve;
  };
  creditMixSubscores: { both: number; single: number; none: number };
  range: {
    /** Half-width on the anchor day. */
    baseHalfWidth: number;
    /** Extra half-width per day since the anchor (the range widens with time). */
    widenPerDay: number;
    maxHalfWidth: number;
  };
  /** Width of the rough band shown when there is no anchor (e.g. "Good: 700–749"). */
  roughBandWidth: number;
  /** Placeholder cut-points from the design mockup (docs/design.md §6.13); admin-editable. */
  zones: readonly ScoreZone[];
  /**
   * The typical borrower that reasons compare against: a factor better than this profile
   * is "up", worse is "down". Utilization sits at the 30% guideline (F4).
   */
  reasonReference: FactorInputs;
}

/**
 * Default weights, totalling 100 (admin W2: seven fields that must total 100). Payment history
 * leads because a missed payment is the most damaging event (PRD §5.3 step 1).
 */
export const DEFAULT_PREDICTOR_WEIGHTS: PredictorWeights = {
  paymentHistory: 35,
  overallUtilization: 11,
  maxCardUtilization: 11,
  hardInquiries: 12,
  creditAge: 16,
  openAccounts: 7,
  creditMix: 8,
};

/** Utilization curve: lower is never worse (PRD §5.5 acceptance), 30% is the guideline (F4). */
const UTILIZATION_CURVE: Curve = [
  [0, 1],
  [10, 0.92],
  [30, 0.6],
  [50, 0.3],
  [75, 0.1],
  [100, 0],
];

export const DEFAULT_PREDICTOR_CONFIG: PredictorConfig = {
  weights: DEFAULT_PREDICTOR_WEIGHTS,
  modelShare: 0.25,
  missedPaymentPenalty: 0.4,
  noHistoryPaymentSubscore: 0.5,
  olderInquiryFactor: 0.5,
  curves: {
    overallUtilization: UTILIZATION_CURVE,
    maxCardUtilization: UTILIZATION_CURVE,
    hardInquiries: [
      [0, 1],
      [1, 0.8],
      [2, 0.55],
      [3, 0.25],
      [4, 0.1],
      [10, 0],
    ],
    creditAge: [
      [0, 0],
      [12, 0.2],
      [36, 0.45],
      [72, 0.65],
      [120, 0.85],
      [240, 1],
    ],
    openAccounts: [
      [0, 0],
      [1, 0.4],
      [2, 0.6],
      [3, 0.75],
      [5, 0.9],
      [8, 1],
    ],
  },
  creditMixSubscores: { both: 1, single: 0.5, none: 0 },
  range: { baseHalfWidth: 10, widenPerDay: 0.2, maxHalfWidth: 60 },
  roughBandWidth: 50,
  zones: [
    { label: 'Poor', min: 300 },
    { label: 'Fair', min: 550 },
    { label: 'Good', min: 650 },
    { label: 'Excellent', min: 750 },
  ],
  reasonReference: {
    onTimePayments: 24,
    missedPayments: 1,
    overallUtilizationPct: 30,
    maxCardUtilizationPct: 30,
    hardInquiries6m: 1,
    hardInquiries12m: 2,
    oldestAccountMonths: 60,
    openAccounts: 3,
    securedAccounts: 0,
    unsecuredAccounts: 3,
  },
};

/** Score scale bounds (F6), used to bound config values. */
const SCALE_MIN = 300;
const SCALE_MAX = 900;

const fail = (field: string, rule: string, value: unknown): never => {
  throw new RangeError(`${field} must be ${rule}, got ${String(value)}`);
};

const requireFinite = (field: string, value: number, min: number, max: number, rule: string) => {
  if (!Number.isFinite(value) || value < min || value > max) fail(field, rule, value);
};

/** Direction each subscore curve must follow, so every factor moves the estimate one way only. */
const CURVE_DIRECTIONS: Record<
  keyof PredictorConfig['curves'],
  'non-increasing' | 'non-decreasing'
> = {
  overallUtilization: 'non-increasing',
  maxCardUtilization: 'non-increasing',
  hardInquiries: 'non-increasing',
  creditAge: 'non-decreasing',
  openAccounts: 'non-decreasing',
};

const validateCurve = (
  name: keyof PredictorConfig['curves'],
  curve: Curve,
  direction: 'non-increasing' | 'non-decreasing',
): void => {
  const field = `curves.${name}`;
  if (curve.length === 0) fail(field, 'a non-empty list of points', '[]');
  curve.forEach(([x, y], i) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`${field}[${i}]`, 'finite', `${x},${y}`);
    if (y < 0 || y > 1) fail(`${field}[${i}]`, 'a subscore in 0..1', y);
    if (i === 0) return;
    const [px, py] = curve[i - 1] as readonly [number, number];
    if (x <= px) fail(`${field}[${i}]`, 'strictly increasing in its input', x);
    const wrongWay = direction === 'non-increasing' ? y > py : y < py;
    if (wrongWay) fail(`${field}[${i}]`, direction, `${py} -> ${y}`);
  });
};

/**
 * Checks every rule in a (possibly admin-edited) predictor config, so a bad value can never yield
 * a NaN, an inverted range or a single exact score (non-negotiable 3).
 * @throws {RangeError} naming the first invalid field.
 */
export function validatePredictorConfig(config: PredictorConfig): void {
  validateWidths(config);
  requireFinite('missedPaymentPenalty', config.missedPaymentPenalty, 0, 1, 'in 0..1');
  requireFinite('noHistoryPaymentSubscore', config.noHistoryPaymentSubscore, 0, 1, 'in 0..1');
  requireFinite('olderInquiryFactor', config.olderInquiryFactor, 0, 1, 'in 0..1');
  for (const key of ['both', 'single', 'none'] as const) {
    requireFinite(`creditMixSubscores.${key}`, config.creditMixSubscores[key], 0, 1, 'in 0..1');
  }
  for (const [name, direction] of Object.entries(CURVE_DIRECTIONS) as Array<
    [keyof PredictorConfig['curves'], 'non-increasing' | 'non-decreasing']
  >) {
    validateCurve(name, config.curves[name], direction);
  }
  if (config.zones.length === 0) fail('zones', 'a non-empty list', '[]');
  for (const zone of config.zones) {
    if (!Number.isFinite(zone.min)) fail('zones', 'finite minimums', zone.min);
  }
}

/** The range, rough-band and blend settings: the ones that could collapse a range to one score. */
function validateWidths(config: PredictorConfig): void {
  const { range } = config;
  requireFinite(
    'range.baseHalfWidth',
    range.baseHalfWidth,
    1,
    SCALE_MAX - SCALE_MIN,
    'finite and >= 1',
  );
  requireFinite('range.widenPerDay', range.widenPerDay, 0, Number.MAX_VALUE, 'finite and >= 0');
  requireFinite(
    'range.maxHalfWidth',
    range.maxHalfWidth,
    range.baseHalfWidth,
    Number.MAX_VALUE,
    'finite and >= range.baseHalfWidth',
  );
  if (
    !Number.isInteger(config.roughBandWidth) ||
    config.roughBandWidth < 2 ||
    config.roughBandWidth > SCALE_MAX - SCALE_MIN
  ) {
    fail('roughBandWidth', 'a whole number in 2..600', config.roughBandWidth);
  }
  if (!Number.isFinite(config.modelShare) || config.modelShare <= 0 || config.modelShare > 1) {
    fail('modelShare', 'in (0, 1]', config.modelShare);
  }
}
