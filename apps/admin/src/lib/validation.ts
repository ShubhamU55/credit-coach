// Validation for the coach_rules form. It mirrors the CHECK constraints in
// supabase/migrations/20261028100000_core_tables.sql exactly (no stricter, no looser), and runs
// on the client (before submit) and on the server (before the UPDATE). The database stays the
// last line of defence.

export const PLANNER_STEPS = ['overdue', 'minimum', 'statement', 'prepay'] as const;
export const REPORTING_BASES = ['statement', 'weekly_current'] as const;
export const WEIGHT_KEYS = [
  'paymentHistory',
  'overallUtilization',
  'maxCardUtilization',
  'hardInquiries',
  'creditAge',
  'openAccounts',
  'creditMix',
] as const;

/** Inclusive integer ranges, one per integer column. */
export const INT_RANGES = {
  threshold_pct: [5, 50],
  excellent_pct: [1, 30],
  pay_by_buffer_days: [0, 7],
  guard_min_hard_inquiries: [1, 10],
  reminder_prepay_days: [0, 14],
} as const;
export type IntField = keyof typeof INT_RANGES;

const DUE_DAYS_RANGE = [0, 14] as const;
const MAX_DUE_DAYS = 5;
const WEIGHT_RANGE = [0, 100] as const;

/** Raw form strings, keyed by input name. A missing key is an error, never a zero. */
export type RawRules = Record<string, string | undefined>;

export type RulesValue = {
  threshold_pct: number;
  excellent_pct: number;
  reporting_basis: (typeof REPORTING_BASES)[number];
  pay_by_buffer_days: number;
  planner_step_order: string[];
  predictor_weights: Record<(typeof WEIGHT_KEYS)[number], number>;
  guard_min_hard_inquiries: number;
  reminder_prepay_days: number;
  reminder_due_days: number[];
};

export type RulesResult =
  { ok: true; value: RulesValue } | { ok: false; errors: Record<string, string> };

/** The seeded defaults as form strings (same as the migration's column defaults). */
export const DEFAULT_RAW_RULES: RawRules = {
  threshold_pct: '30',
  excellent_pct: '10',
  reporting_basis: 'statement',
  pay_by_buffer_days: '1',
  step_1: 'overdue',
  step_2: 'minimum',
  step_3: 'statement',
  step_4: 'prepay',
  w_paymentHistory: '35',
  w_overallUtilization: '11',
  w_maxCardUtilization: '11',
  w_hardInquiries: '12',
  w_creditAge: '16',
  w_openAccounts: '7',
  w_creditMix: '8',
  guard_min_hard_inquiries: '2',
  reminder_prepay_days: '2',
  reminder_due_days: '3, 1',
};

/** A whole number written in plain digits (optional minus). `Number('')` is 0, so check the text. */
function parseInteger(text: string | undefined): number | null {
  if (text === undefined || !/^-?\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return Number.isSafeInteger(n) ? n : null;
}

/** A plain decimal number (no exponent, NaN or Infinity). Postgres numeric accepts decimals. */
function parseDecimal(text: string | undefined): number | null {
  if (text === undefined || !/^-?\d+(\.\d+)?$/.test(text.trim())) return null;
  return Number(text.trim());
}

function intField(raw: RawRules, field: IntField, errors: Record<string, string>): number {
  const [lo, hi] = INT_RANGES[field];
  const n = parseInteger(raw[field]);
  if (n === null || n < lo || n > hi) {
    errors[field] = `Enter a whole number from ${lo} to ${hi}.`;
    return NaN;
  }
  return n;
}

function readBasis(raw: RawRules, errors: Record<string, string>): RulesValue['reporting_basis'] {
  const basis = REPORTING_BASES.find((b) => b === raw.reporting_basis);
  if (!basis) errors.reporting_basis = 'Choose statement or weekly_current.';
  return basis ?? 'statement';
}

function readSteps(raw: RawRules, errors: Record<string, string>): string[] {
  const steps = [raw.step_1, raw.step_2, raw.step_3, raw.step_4].map((s) => s ?? '');
  const isPermutation = PLANNER_STEPS.every((s) => steps.filter((x) => x === s).length === 1);
  if (!isPermutation) errors.planner_step_order = 'Use each of the four steps exactly once.';
  return steps;
}

function readWeights(
  raw: RawRules,
  errors: Record<string, string>,
): RulesValue['predictor_weights'] {
  const weights = {} as RulesValue['predictor_weights'];
  for (const key of WEIGHT_KEYS) {
    const n = parseDecimal(raw[`w_${key}`]);
    if (n === null || n < WEIGHT_RANGE[0] || n > WEIGHT_RANGE[1]) {
      errors[`w_${key}`] = `Enter a number from ${WEIGHT_RANGE[0]} to ${WEIGHT_RANGE[1]}.`;
    } else {
      weights[key] = n;
    }
  }
  return weights;
}

function readDueDays(raw: RawRules, errors: Record<string, string>): number[] {
  const parts = (raw.reminder_due_days ?? '').split(',').map((p) => parseInteger(p));
  const [lo, hi] = DUE_DAYS_RANGE;
  const valid =
    parts.length >= 1 &&
    parts.length <= MAX_DUE_DAYS &&
    parts.every((n) => n !== null && n >= lo && n <= hi);
  if (!valid) {
    errors.reminder_due_days = `Enter 1 to ${MAX_DUE_DAYS} whole numbers from ${lo} to ${hi}, separated by commas.`;
  }
  return parts.filter((n): n is number => n !== null);
}

export function validateRules(raw: RawRules): RulesResult {
  const errors: Record<string, string> = {};
  const value: RulesValue = {
    threshold_pct: intField(raw, 'threshold_pct', errors),
    excellent_pct: intField(raw, 'excellent_pct', errors),
    reporting_basis: readBasis(raw, errors),
    pay_by_buffer_days: intField(raw, 'pay_by_buffer_days', errors),
    planner_step_order: readSteps(raw, errors),
    predictor_weights: readWeights(raw, errors),
    guard_min_hard_inquiries: intField(raw, 'guard_min_hard_inquiries', errors),
    reminder_prepay_days: intField(raw, 'reminder_prepay_days', errors),
    reminder_due_days: readDueDays(raw, errors),
  };
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** Collect the form's string fields (file inputs are ignored). */
export function rawFromFormData(data: FormData): RawRules {
  const raw: RawRules = {};
  for (const [key, v] of data.entries()) {
    if (typeof v === 'string') raw[key] = v;
  }
  return raw;
}
