// The request contract of the `explain` Edge Function: the strict JSON the engine builds
// (`ExplainPayload` in packages/engine/src/explain.ts). Every amount, date and percent in it is
// already computed; this function only words it. No dependencies, so it also runs under Deno as is.

export type PlanItemKind = 'overdue_minimum' | 'minimum' | 'statement' | 'prepay';
export type ShortfallKind = 'overdue_minimum' | 'minimum';

export type ReasonCode =
  | 'overdue'
  | 'minimum_due_soon'
  | 'minimum_due'
  | 'statement_full'
  | 'statement_partial'
  | 'statement_after_due'
  | 'prepay_threshold'
  | 'prepay_excellent'
  | 'prepay_partial'
  | 'nothing_more_needed'
  | 'all_within_threshold'
  | 'above_threshold'
  | 'shortfall';

export interface PayloadItem {
  step: number;
  kind: PlanItemKind;
  card: string;
  amount: number;
  payBy: string;
  reasonCode: ReasonCode;
  utilizationBefore: number | null;
  utilizationAfter: number | null;
}

export interface PayloadShortfall {
  card: string;
  kind: ShortfallKind;
  required: number;
  funded: number;
  shortfall: number;
  dueDate: string;
}

export interface ExplainPayload {
  version: 1;
  today: string;
  thresholdPct: number;
  aimFor10: boolean;
  summaryCode: ReasonCode;
  items: PayloadItem[];
  shortfalls: PayloadShortfall[];
  cashUsed: number;
  leftover: number;
  overallUtilizationBefore: number | null;
  overallUtilizationAfter: number | null;
  highestCardBefore: number | null;
  highestCardAfter: number | null;
  withinThreshold: boolean;
}

export type Validation = { ok: true; value: ExplainPayload } | { ok: false; path: string };

const REASON_CODES: readonly string[] = [
  'overdue',
  'minimum_due_soon',
  'minimum_due',
  'statement_full',
  'statement_partial',
  'statement_after_due',
  'prepay_threshold',
  'prepay_excellent',
  'prepay_partial',
  'nothing_more_needed',
  'all_within_threshold',
  'above_threshold',
  'shortfall',
];
const ITEM_KINDS: readonly string[] = ['overdue_minimum', 'minimum', 'statement', 'prepay'];
const SHORTFALL_KINDS: readonly string[] = ['overdue_minimum', 'minimum'];

const ROOT_KEYS = [
  'version',
  'today',
  'thresholdPct',
  'aimFor10',
  'summaryCode',
  'items',
  'shortfalls',
  'cashUsed',
  'leftover',
  'overallUtilizationBefore',
  'overallUtilizationAfter',
  'highestCardBefore',
  'highestCardAfter',
  'withinThreshold',
];
const ITEM_KEYS = [
  'step',
  'kind',
  'card',
  'amount',
  'payBy',
  'reasonCode',
  'utilizationBefore',
  'utilizationAfter',
];
const SHORTFALL_KEYS = ['card', 'kind', 'required', 'funded', 'shortfall', 'dueDate'];

export const MAX_ITEMS = 30;
export const MAX_SHORTFALLS = 30;
/** Rupees are integers; nothing a person owes on cards comes near this. */
const MAX_RUPEES = 10_000_000_000;
/** Utilization can pass 100 when a card is over its limit, but never absurdly so. */
const MAX_PERCENT = 1000;

/**
 * Card names are user-typed and end up in a prompt: letters (with combining marks, so Indic
 * scripts work), digits and a few separators only. No newlines, quotes, backticks or angle brackets.
 */
const CARD_NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .&'()/+-]{0,59}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** True when `s` is `YYYY-MM-DD` and names a real calendar day. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const isRupees = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_RUPEES;

const isPercentOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_PERCENT);

/** The first key that is missing or extra, as a path; null when the key sets match exactly. */
function keyMismatch(obj: Record<string, unknown>, keys: readonly string[], path: string) {
  for (const key of keys) {
    if (!(key in obj)) return `${path}${key}`;
  }
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) return `${path}${key}`;
  }
  return null;
}

function checkItem(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return path;
  const mismatch = keyMismatch(raw, ITEM_KEYS, `${path}.`);
  if (mismatch) return mismatch;
  const step = raw.step;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 1000) {
    return `${path}.step`;
  }
  if (typeof raw.kind !== 'string' || !ITEM_KINDS.includes(raw.kind)) return `${path}.kind`;
  if (typeof raw.card !== 'string' || !CARD_NAME.test(raw.card)) return `${path}.card`;
  if (!isRupees(raw.amount)) return `${path}.amount`;
  if (!isIsoDate(raw.payBy)) return `${path}.payBy`;
  if (typeof raw.reasonCode !== 'string' || !REASON_CODES.includes(raw.reasonCode)) {
    return `${path}.reasonCode`;
  }
  if (!isPercentOrNull(raw.utilizationBefore)) return `${path}.utilizationBefore`;
  if (!isPercentOrNull(raw.utilizationAfter)) return `${path}.utilizationAfter`;
  return null;
}

function checkShortfall(raw: unknown, path: string): string | null {
  if (!isRecord(raw)) return path;
  const mismatch = keyMismatch(raw, SHORTFALL_KEYS, `${path}.`);
  if (mismatch) return mismatch;
  if (typeof raw.card !== 'string' || !CARD_NAME.test(raw.card)) return `${path}.card`;
  if (typeof raw.kind !== 'string' || !SHORTFALL_KINDS.includes(raw.kind)) return `${path}.kind`;
  if (!isRupees(raw.required)) return `${path}.required`;
  if (!isRupees(raw.funded)) return `${path}.funded`;
  if (!isRupees(raw.shortfall)) return `${path}.shortfall`;
  if (!isIsoDate(raw.dueDate)) return `${path}.dueDate`;
  return null;
}

function firstError(
  list: unknown[],
  check: (raw: unknown, path: string) => string | null,
  name: string,
) {
  for (let i = 0; i < list.length; i += 1) {
    const error = check(list[i], `${name}[${i}]`);
    if (error) return error;
  }
  return null;
}

/**
 * Strict validation of an unknown request body. Unknown keys, wrong types, out-of-range numbers
 * and bad dates are all rejected. On failure only the offending field path is returned, never the
 * value, so nothing the caller sent is echoed or logged.
 */
export function validatePayload(input: unknown): Validation {
  if (!isRecord(input)) return { ok: false, path: '$' };
  const mismatch = keyMismatch(input, ROOT_KEYS, '');
  if (mismatch) return { ok: false, path: mismatch };

  if (input.version !== 1) return { ok: false, path: 'version' };
  if (!isIsoDate(input.today)) return { ok: false, path: 'today' };
  const threshold = input.thresholdPct;
  if (
    typeof threshold !== 'number' ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 100
  ) {
    return { ok: false, path: 'thresholdPct' };
  }
  if (typeof input.aimFor10 !== 'boolean') return { ok: false, path: 'aimFor10' };
  if (typeof input.summaryCode !== 'string' || !REASON_CODES.includes(input.summaryCode)) {
    return { ok: false, path: 'summaryCode' };
  }
  if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) {
    return { ok: false, path: 'items' };
  }
  const itemError = firstError(input.items, checkItem, 'items');
  if (itemError) return { ok: false, path: itemError };
  if (!Array.isArray(input.shortfalls) || input.shortfalls.length > MAX_SHORTFALLS) {
    return { ok: false, path: 'shortfalls' };
  }
  const shortfallError = firstError(input.shortfalls, checkShortfall, 'shortfalls');
  if (shortfallError) return { ok: false, path: shortfallError };
  if (!isRupees(input.cashUsed)) return { ok: false, path: 'cashUsed' };
  if (!isRupees(input.leftover)) return { ok: false, path: 'leftover' };
  for (const key of [
    'overallUtilizationBefore',
    'overallUtilizationAfter',
    'highestCardBefore',
    'highestCardAfter',
  ] as const) {
    if (!isPercentOrNull(input[key])) return { ok: false, path: key };
  }
  if (typeof input.withinThreshold !== 'boolean') return { ok: false, path: 'withinThreshold' };

  return { ok: true, value: input as unknown as ExplainPayload };
}
