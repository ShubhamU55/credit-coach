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

const clampScore = (score: number): number => Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));

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
 */
export function formatINR(rupees: number): string {
  const rounded = Math.round(Math.abs(rupees));
  const grouped = groupIndianDigits(String(rounded));
  const sign = rupees < 0 && rounded !== 0 ? '−' : '';
  return `${sign}₹${grouped}`;
}

/** Formats a ratio-style number as a percentage to 1 decimal place, e.g. `45.0%`. */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Parses a `YYYY-MM-DD` string into a UTC calendar date with no time-zone shift. */
const parseIsoDate = (isoDate: string): Date => {
  const parts = isoDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(Date.UTC(year, month - 1, day));
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

/** Clamps both bounds to 300-900, orders them low <= high, and joins with an en dash. */
export function formatScoreRange(low: number, high: number): string {
  const clampedLow = clampScore(low);
  const clampedHigh = clampScore(high);
  const ordered = [Math.min(clampedLow, clampedHigh), Math.max(clampedLow, clampedHigh)];
  return `${ordered[0]}–${ordered[1]}`;
}

/**
 * Masks a PAN to its first 2 and last 3 characters, e.g. `ABXXXXX34F`.
 * Trims and uppercases first. Throws `RangeError` (without echoing the
 * input, per PRD non-negotiable 5) unless it matches `^[A-Z]{5}[0-9]{4}[A-Z]$`.
 */
export function maskPan(pan: string): string {
  const normalized = pan.trim().toUpperCase();
  if (!PAN_PATTERN.test(normalized)) {
    throw new RangeError('Invalid PAN format');
  }
  return `${normalized.slice(0, 2)}XXXXX${normalized.slice(-3)}`;
}

/** Joins a before and after value with an arrow, e.g. `19.5% → 18.7%`. */
export function formatBeforeAfter(before: string, after: string): string {
  return `${before} → ${after}`;
}
