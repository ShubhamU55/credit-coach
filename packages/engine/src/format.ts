/** Lowest valid CIBIL score (PRD §5.2 score-range clamp). */
const SCORE_MIN = 300;
/** Highest valid CIBIL score (PRD §5.2 score-range clamp). */
const SCORE_MAX = 900;
/** Milliseconds in a calendar day, used for UTC date-difference math. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Days-out boundary above which `formatRelativeDate` falls back to the short date. */
const RELATIVE_DAYS_MAX = 7;
/** Number of trailing digits grouped alone before Indian 2-digit grouping starts. */
const INDIAN_GROUPING_HEAD = 3;
/** Size of each group after the first, in Indian digit grouping (lakh/crore style). */
const INDIAN_GROUPING_SIZE = 2;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `ABCDE1234F`-shaped PAN: 5 letters, 4 digits, 1 letter. */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** ASCII-only shape check, run before `toUpperCase()` so a non-ASCII letter that
 * case-folds into two ASCII letters (e.g. `ß` -> `SS`) can never pass as a PAN. */
const ASCII_PAN_SHAPE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

const clampScore = (score: number): number => Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));

/** Throws a `RangeError` unless `value` is finite, so callers never silently render `NaN`/`Infinity`. */
const assertFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
};

/** Groups digits Indian-style: last 3 together, then pairs (e.g. `1,23,45,678`). */
const groupIndianDigits = (digits: string): string => {
  if (digits.length <= INDIAN_GROUPING_HEAD) return digits;
  const head = digits.slice(0, digits.length - INDIAN_GROUPING_HEAD);
  const tail = digits.slice(digits.length - INDIAN_GROUPING_HEAD);
  const groups: string[] = [];
  let rest = head;
  while (rest.length > INDIAN_GROUPING_SIZE) {
    groups.unshift(rest.slice(-INDIAN_GROUPING_SIZE));
    rest = rest.slice(0, -INDIAN_GROUPING_SIZE);
  }
  if (rest.length > 0) groups.unshift(rest);
  return [...groups, tail].join(',');
};

/**
 * Formats integer rupees with Indian digit grouping and a `₹` prefix.
 * Rounds to the nearest rupee first, then negates only when the rounded
 * magnitude is non-zero, so `-0.4` renders as `₹0`, not `−₹0`.
 * @throws {RangeError} if `rupees` is not finite or rounds outside the safe integer range.
 */
export function formatINR(rupees: number): string {
  assertFinite(rupees, 'rupees');
  const rounded = Math.round(Math.abs(rupees));
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError(`rupees must round to a safe integer, got ${rupees}`);
  }
  const grouped = groupIndianDigits(String(rounded));
  const sign = rupees < 0 && rounded !== 0 ? '−' : '';
  return `${sign}₹${grouped}`;
}

/**
 * Formats a ratio-style number as a percentage to 1 decimal place, e.g. `45.0%`.
 * Uses the typographic minus sign (U+2212), matching `formatINR`.
 * @throws {RangeError} if `value` is not finite.
 */
export function formatPercent(value: number): string {
  assertFinite(value, 'value');
  const fixed = Math.abs(value).toFixed(1);
  const sign = value < 0 && Number(fixed) !== 0 ? '−' : '';
  return `${sign}${fixed}%`;
}

/** `YYYY-MM-DD` with a 4-digit year, strictly (no 2-digit year rollover). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a `YYYY-MM-DD` string into a UTC calendar date with no time-zone shift.
 * @throws {RangeError} if `isoDate` is malformed or names a day that doesn't exist
 * (e.g. 29 February on a non-leap year, or 31 April).
 */
const parseIsoDate = (isoDate: string): Date => {
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    throw new RangeError(`isoDate must be YYYY-MM-DD, got ${isoDate}`);
  }
  const parts = isoDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!roundTrips) {
    throw new RangeError(`isoDate does not name a real calendar date, got ${isoDate}`);
  }
  return date;
};

/** Formats a `YYYY-MM-DD` calendar date as e.g. `Thu, 22 Oct`. */
export function formatShortDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  const dayName = DAY_NAMES[date.getUTCDay()];
  const monthName = MONTH_NAMES[date.getUTCMonth()];
  return `${dayName}, ${date.getUTCDate()} ${monthName}`;
}

/**
 * Formats a `YYYY-MM-DD` calendar date relative to today: `today`, `tomorrow`,
 * `in N days` for 2-7 days out, otherwise the short date (including past dates).
 */
export function formatRelativeDate(isoDate: string, todayIso: string): string {
  const daysOut = Math.round(
    (parseIsoDate(isoDate).getTime() - parseIsoDate(todayIso).getTime()) / MS_PER_DAY,
  );
  if (daysOut === 0) return 'today';
  if (daysOut === 1) return 'tomorrow';
  if (daysOut >= 2 && daysOut <= RELATIVE_DAYS_MAX) return `in ${daysOut} days`;
  return formatShortDate(isoDate);
}

/**
 * Clamps both bounds to 300-900, orders them low <= high, and joins with an en dash.
 * @throws {RangeError} if `low` or `high` is not finite.
 */
export function formatScoreRange(low: number, high: number): string {
  assertFinite(low, 'low');
  assertFinite(high, 'high');
  const clampedLow = clampScore(low);
  const clampedHigh = clampScore(high);
  const ordered = [Math.min(clampedLow, clampedHigh), Math.max(clampedLow, clampedHigh)];
  return `${ordered[0]}–${ordered[1]}`;
}

/**
 * Masks a PAN to its first 2 and last 3 characters, e.g. `ABXXXXX34F`.
 * Trims first, then checks the shape is ASCII letters/digits only -- before
 * uppercasing -- so a non-ASCII letter that `toUpperCase()` case-folds into
 * two ASCII letters (e.g. `ß` -> `SS`) can never be mistaken for a PAN.
 * Throws `RangeError` (without echoing the input, per PRD non-negotiable 5)
 * unless it matches `^[A-Z]{5}[0-9]{4}[A-Z]$` after uppercasing.
 */
export function maskPan(pan: string): string {
  const trimmed = pan.trim();
  if (!ASCII_PAN_SHAPE.test(trimmed)) {
    throw new RangeError('Invalid PAN format');
  }
  const normalized = trimmed.toUpperCase();
  if (!PAN_PATTERN.test(normalized)) {
    throw new RangeError('Invalid PAN format');
  }
  return `${normalized.slice(0, 2)}XXXXX${normalized.slice(-3)}`;
}

/** Joins a before and after value with an arrow, e.g. `19.5% → 18.7%`. */
export function formatBeforeAfter(before: string, after: string): string {
  return `${before} → ${after}`;
}
