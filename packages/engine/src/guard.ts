import { estimateShift, predictScore, type PredictorInput, type ScoreEstimate } from './predictor';
import { DEFAULT_PREDICTOR_CONFIG, type PredictorConfig } from './predictor-config';

/** The largest possible model drop: the whole 300–900 scale. Bounds the impact spread. */
const MAX_DROP_POINTS = 600;

/** Application guard rules (PRD §5.6). Admin-adjustable (IA W2: N in 1–6). */
export interface GuardConfig {
  /** Warn when the last 6 months already hold at least this many hard inquiries (N). */
  minHardInquiries6m: number;
  /**
   * Multipliers on the model's central drop that give the impact range, e.g. a 4-point drop
   * with `{ low: 1, high: 3 }` shows "could cost 4–12 points". The real bureau penalty for
   * clustered applications is uncertain, so the range is skewed towards a larger drop.
   */
  impactSpread: { low: number; high: number };
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  minHardInquiries6m: 2,
  impactSpread: { low: 1, high: 3 },
};

/** Points the estimate could drop after one more application. Always `pointsLow < pointsHigh`. */
export interface ApplicationImpact {
  pointsLow: number;
  pointsHigh: number;
}

export interface GuardResult {
  shouldWarn: boolean;
  hardInquiries6m: number;
  /** The configured N. */
  threshold: number;
  impact: ApplicationImpact;
  estimateBefore: ScoreEstimate;
  /** The estimate with one more hard inquiry in both the 6- and 12-month counts. */
  estimateAfter: ScoreEstimate;
}

const validateGuardConfig = ({ minHardInquiries6m, impactSpread }: GuardConfig): void => {
  if (!Number.isInteger(minHardInquiries6m) || minHardInquiries6m < 1) {
    throw new RangeError(
      `minHardInquiries6m must be a whole number >= 1, got ${minHardInquiries6m}`,
    );
  }
  const { low, high } = impactSpread;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) {
    throw new RangeError(`impactSpread must satisfy 0 <= low <= high, got ${low}..${high}`);
  }
  if (!Number.isFinite(Math.round(high * MAX_DROP_POINTS))) {
    throw new RangeError(
      `impactSpread.high is too large to give a finite points range, got ${high}`,
    );
  }
};

/** One more application: a hard inquiry in both windows (F1). Self-checks never count. */
export const withOneMoreInquiry = (input: PredictorInput): PredictorInput => ({
  ...input,
  hardInquiries6m: Math.max(0, input.hardInquiries6m) + 1,
  hardInquiries12m: Math.max(input.hardInquiries6m, input.hardInquiries12m, 0) + 1,
});

/**
 * Checks a new card or loan application against the hard-inquiry guard (PRD §5.6). It warns at
 * N or more hard inquiries in the last 6 months and always gives the estimated impact range.
 * The caller adds the applications the user logged to `hardInquiries6m`/`12m`.
 * @throws {RangeError} on an invalid guard config, or on input `predictScore` rejects.
 */
export function checkApplicationGuard(
  input: PredictorInput,
  config: GuardConfig = DEFAULT_GUARD_CONFIG,
  predictorConfig: PredictorConfig = DEFAULT_PREDICTOR_CONFIG,
): GuardResult {
  validateGuardConfig(config);
  const after = withOneMoreInquiry(input);
  const drop = Math.max(0, -estimateShift(input, after, predictorConfig));
  const pointsLow = Math.round(drop * config.impactSpread.low);
  const pointsHigh = Math.max(pointsLow + 1, Math.round(drop * config.impactSpread.high));
  const hardInquiries6m = Math.max(0, input.hardInquiries6m);
  return {
    shouldWarn: hardInquiries6m >= config.minHardInquiries6m,
    hardInquiries6m,
    threshold: config.minHardInquiries6m,
    impact: { pointsLow, pointsHigh },
    estimateBefore: predictScore(input, predictorConfig),
    estimateAfter: predictScore(after, predictorConfig),
  };
}
