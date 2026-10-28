import {
  DEFAULT_PREDICTOR_CONFIG,
  SCORE_FACTORS,
  type Curve,
  type FactorInputs,
  type PredictorConfig,
  type ScoreFactor,
} from './predictor-config';

/** Lowest valid CIBIL score (F6). */
const SCORE_MIN = 300;
/** Highest valid CIBIL score (F6). */
const SCORE_MAX = 900;
/** Below this, a factor's gap counts as no change ("flat"). */
const EPSILON = 1e-9;
/** Number of reasons shown (PRD §5.5: top 3). */
const TOP_REASONS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** `YYYY-MM-DD` with a 4-digit year. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The last bureau score and its `YYYY-MM-DD` date (PRD §5.5 anchor). */
export interface ScoreAnchor {
  score: number;
  date: string;
}

/** Everything the predictor reads. `today` is passed in; the engine never reads the clock. */
export interface PredictorInput extends FactorInputs {
  anchor?: ScoreAnchor;
  today: string;
}

/** The numbers behind each reason, in the factor's own units. */
export interface FactorValues {
  paymentHistory: { onTimePayments: number; missedPayments: number };
  overallUtilization: { pct: number };
  maxCardUtilization: { pct: number };
  hardInquiries: { last6m: number; last12m: number };
  creditAge: { oldestAccountMonths: number };
  openAccounts: { count: number };
  creditMix: { secured: number; unsecured: number };
}

/** `up` helps the score, `down` lowers it. */
export type ReasonDirection = 'up' | 'down' | 'flat';

/** One reason row. `previous` is set only when comparing two states (a what-if). */
export type ScoreReason = {
  [K in ScoreFactor]: {
    factor: K;
    direction: ReasonDirection;
    current: FactorValues[K];
    previous?: FactorValues[K];
  };
}[ScoreFactor];

/**
 * An estimate is always a range (`low < high`) plus a zone word and reasons, clamped to
 * 300–900. It never carries one exact score (non-negotiable 3).
 */
export interface ScoreEstimate {
  low: number;
  high: number;
  /** Zone label from config, e.g. `Good`. */
  band: string;
  reasons: ScoreReason[];
  /** True when there is no anchor: the range is a coarse band, labelled "rough estimate". */
  isRoughBand: boolean;
}

const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
};

/** Days since the Unix epoch for a real `YYYY-MM-DD` calendar date. */
const isoToDayNumber = (isoDate: string): number => {
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    throw new RangeError(`date must be YYYY-MM-DD, got ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`date does not name a real calendar date, got ${isoDate}`);
  }
  return Math.round(ms / MS_PER_DAY);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const interpolate = (curve: Curve, x: number): number => {
  const first = curve[0];
  if (first === undefined || x <= first[0]) return first?.[1] ?? 0;
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1] as readonly [number, number];
    const [x1, y1] = curve[i] as readonly [number, number];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return (curve[curve.length - 1] as readonly [number, number])[1];
};

/** Validates every number and floors counts at 0, so the rules see clean factors. */
const normalizeFactors = (input: FactorInputs): FactorInputs => {
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number') assertFinite(value, key);
  }
  const count = (n: number): number => Math.max(0, n);
  const inquiries6m = count(input.hardInquiries6m);
  return {
    onTimePayments: count(input.onTimePayments),
    missedPayments: count(input.missedPayments),
    overallUtilizationPct: input.overallUtilizationPct,
    maxCardUtilizationPct: input.maxCardUtilizationPct,
    hardInquiries6m: inquiries6m,
    hardInquiries12m: Math.max(inquiries6m, count(input.hardInquiries12m)),
    oldestAccountMonths: count(input.oldestAccountMonths),
    openAccounts: count(input.openAccounts),
    securedAccounts: count(input.securedAccounts),
    unsecuredAccounts: count(input.unsecuredAccounts),
  };
};

const paymentSubscore = (f: FactorInputs, config: PredictorConfig): number => {
  const total = f.onTimePayments + f.missedPayments;
  if (total === 0) return config.noHistoryPaymentSubscore;
  const onTimeRatio = f.onTimePayments / total;
  return Math.max(0, onTimeRatio - config.missedPaymentPenalty * f.missedPayments);
};

const creditMixSubscore = (f: FactorInputs, config: PredictorConfig): number => {
  const { both, single, none } = config.creditMixSubscores;
  if (f.securedAccounts > 0 && f.unsecuredAccounts > 0) return both;
  return f.securedAccounts + f.unsecuredAccounts > 0 ? single : none;
};

/** Each factor's subscore in 0–1. Each is monotone in its factor. */
const subscores = (f: FactorInputs, config: PredictorConfig): Record<ScoreFactor, number> => {
  const { curves } = config;
  const olderInquiries = f.hardInquiries12m - f.hardInquiries6m;
  return {
    paymentHistory: paymentSubscore(f, config),
    overallUtilization: interpolate(curves.overallUtilization, f.overallUtilizationPct),
    maxCardUtilization: interpolate(curves.maxCardUtilization, f.maxCardUtilizationPct),
    hardInquiries: interpolate(
      curves.hardInquiries,
      f.hardInquiries6m + config.olderInquiryFactor * olderInquiries,
    ),
    creditAge: interpolate(curves.creditAge, f.oldestAccountMonths),
    openAccounts: interpolate(curves.openAccounts, f.openAccounts),
    creditMix: creditMixSubscore(f, config),
  };
};

/** Validates the weights and returns their sum. */
const weightTotal = (config: PredictorConfig): number => {
  let total = 0;
  for (const factor of SCORE_FACTORS) {
    const weight = config.weights[factor];
    assertFinite(weight, `weights.${factor}`);
    if (weight < 0) throw new RangeError(`weights.${factor} must not be negative, got ${weight}`);
    total += weight;
  }
  if (total <= 0) throw new RangeError('weights must not all be zero');
  return total;
};

/** Rules-model score in 300–900: 300 plus 600 × the weighted mean subscore. */
const modelScore = (f: FactorInputs, config: PredictorConfig): number => {
  const total = weightTotal(config);
  const s = subscores(f, config);
  const weighted = SCORE_FACTORS.reduce((sum, k) => sum + config.weights[k] * s[k], 0);
  return SCORE_MIN + ((SCORE_MAX - SCORE_MIN) * weighted) / total;
};

/** Internal integer center of the estimate. Never returned to callers as a score. */
const estimateCenter = (input: PredictorInput, config: PredictorConfig): number => {
  const model = modelScore(normalizeFactors(input), config);
  if (input.anchor === undefined) return Math.round(model);
  assertFinite(input.anchor.score, 'anchor.score');
  const anchor = clamp(input.anchor.score, SCORE_MIN, SCORE_MAX);
  return Math.round(anchor + config.modelShare * (model - anchor));
};

const zoneFor = (score: number, config: PredictorConfig): string => {
  let label = config.zones[0]?.label ?? '';
  for (const zone of config.zones) if (score >= zone.min) label = zone.label;
  return label;
};

const halfWidth = (anchorDate: string, today: string, config: PredictorConfig): number => {
  const days = Math.max(0, isoToDayNumber(today) - isoToDayNumber(anchorDate));
  const { baseHalfWidth, widenPerDay, maxHalfWidth } = config.range;
  return Math.min(maxHalfWidth, Math.round(baseHalfWidth + widenPerDay * days));
};

/** A `center ± half` window slid (not clipped) inside 300–900, so its width never collapses. */
const slideWindow = (center: number, half: number): { low: number; high: number } => {
  const span = Math.min(2 * half, SCORE_MAX - SCORE_MIN);
  const low = clamp(center - half, SCORE_MIN, SCORE_MAX - span);
  return { low, high: low + span };
};

/** The fixed-width band containing `score`; the last band absorbs the remainder up to 900. */
const roughBand = (score: number, config: PredictorConfig): { low: number; high: number } => {
  const bandWidth = config.roughBandWidth;
  const lastBand = Math.floor((SCORE_MAX - SCORE_MIN - 1) / bandWidth);
  const band = Math.min(Math.floor((score - SCORE_MIN) / bandWidth), lastBand);
  const low = SCORE_MIN + band * bandWidth;
  return { low, high: band === lastBand ? SCORE_MAX : low + bandWidth - 1 };
};

const factorValues = <K extends ScoreFactor>(factor: K, f: FactorInputs): FactorValues[K] => {
  const all: FactorValues = {
    paymentHistory: { onTimePayments: f.onTimePayments, missedPayments: f.missedPayments },
    overallUtilization: { pct: f.overallUtilizationPct },
    maxCardUtilization: { pct: f.maxCardUtilizationPct },
    hardInquiries: { last6m: f.hardInquiries6m, last12m: f.hardInquiries12m },
    creditAge: { oldestAccountMonths: f.oldestAccountMonths },
    openAccounts: { count: f.openAccounts },
    creditMix: { secured: f.securedAccounts, unsecured: f.unsecuredAccounts },
  };
  return all[factor];
};

const directionOf = (gap: number): ReasonDirection => {
  if (gap > EPSILON) return 'up';
  return gap < -EPSILON ? 'down' : 'flat';
};

/** Factors ranked by weighted subscore gap from `baseline` to `current` (stable by factor order). */
const rankedGaps = (
  baseline: FactorInputs,
  current: FactorInputs,
  config: PredictorConfig,
): Array<{ factor: ScoreFactor; gap: number }> => {
  const from = subscores(baseline, config);
  const to = subscores(current, config);
  return SCORE_FACTORS.map((factor) => ({
    factor,
    gap: config.weights[factor] * (to[factor] - from[factor]),
  })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
};

/** The top 3 reasons for one state, each compared with the typical-borrower reference. */
const topReasons = (f: FactorInputs, config: PredictorConfig): ScoreReason[] => {
  const reference = normalizeFactors(config.reasonReference);
  return rankedGaps(reference, f, config)
    .slice(0, TOP_REASONS)
    .map(
      ({ factor, gap }) =>
        ({ factor, direction: directionOf(gap), current: factorValues(factor, f) }) as ScoreReason,
    );
};

/**
 * Estimates the score as a range plus the top 3 reasons (PRD §5.5).
 * With an anchor, the range is centred near the anchor and widens with days since it.
 * Without one, it is the coarse band the model lands in, flagged `isRoughBand`.
 * @throws {RangeError} on a malformed date, a non-finite number, or invalid weights.
 */
export function predictScore(
  input: PredictorInput,
  config: PredictorConfig = DEFAULT_PREDICTOR_CONFIG,
): ScoreEstimate {
  const factors = normalizeFactors(input);
  const center = estimateCenter(input, config);
  const reasons = topReasons(factors, config);
  const band = zoneFor(center, config);
  if (input.anchor === undefined) {
    isoToDayNumber(input.today);
    return { ...roughBand(center, config), band, reasons, isRoughBand: true };
  }
  const half = halfWidth(input.anchor.date, input.today, config);
  return { ...slideWindow(center, half), band, reasons, isRoughBand: false };
}

/**
 * Reasons for a change between two states (a what-if): only the factors that moved, ranked by
 * weighted effect, each with `previous` and `current` numbers. At most 3.
 */
export function compareReasons(
  before: FactorInputs,
  after: FactorInputs,
  config: PredictorConfig = DEFAULT_PREDICTOR_CONFIG,
): ScoreReason[] {
  const from = normalizeFactors(before);
  const to = normalizeFactors(after);
  return rankedGaps(from, to, config)
    .filter(({ gap }) => Math.abs(gap) > EPSILON)
    .slice(0, TOP_REASONS)
    .map(
      ({ factor, gap }) =>
        ({
          factor,
          direction: directionOf(gap),
          current: factorValues(factor, to),
          previous: factorValues(factor, from),
        }) as ScoreReason,
    );
}

/**
 * How far the estimate's centre moves from `before` to `after`, in points (negative = lower).
 * A difference, not a score; the guard turns it into an impact range.
 */
export function estimateShift(
  before: PredictorInput,
  after: PredictorInput,
  config: PredictorConfig = DEFAULT_PREDICTOR_CONFIG,
): number {
  return estimateCenter(after, config) - estimateCenter(before, config);
}
