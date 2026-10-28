import type { Card, CardCycle, CoachRules, IsoDate, ReportingPoint } from './types';

/** Milliseconds in a calendar day, for UTC day arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Fixed weekly bureau snapshot days; the month-end is added per month (PRD §5.4, F2). */
const WEEKLY_SNAPSHOT_DAYS = [7, 14, 21, 28] as const;
/** The first snapshot of a month. */
const FIRST_WEEKLY_SNAPSHOT_DAY = 7;
/** Card statement and due days are days of the month. */
const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 31;

/** `YYYY-MM-DD` with a 4-digit year, strictly. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface YearMonth {
  year: number;
  /** 1-12. */
  month: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toIso = (year: number, month: number, day: number): IsoDate =>
  `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;

/**
 * Parses a `YYYY-MM-DD` calendar date to UTC milliseconds.
 * @throws {RangeError} if malformed or not a real calendar date (e.g. 29 Feb 2027).
 */
const parseIso = (iso: IsoDate): number => {
  if (!ISO_DATE_PATTERN.test(iso)) {
    throw new RangeError(`date must be YYYY-MM-DD, got ${iso}`);
  }
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(year, month - 1, day);
  // A day that overflows its month (31 Apr, 29 Feb 2027) rolls over, so it no longer round-trips.
  if (fromMs(ms) !== iso) {
    throw new RangeError(`date does not name a real calendar day, got ${iso}`);
  }
  return ms;
};

const fromMs = (ms: number): IsoDate => {
  const date = new Date(ms);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const yearMonthOf = (iso: IsoDate): YearMonth => {
  parseIso(iso);
  const [year, month] = iso.split('-').map(Number) as [number, number];
  return { year, month };
};

const shiftMonth = ({ year, month }: YearMonth, by: number): YearMonth => {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

const daysInMonth = ({ year, month }: YearMonth): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The given day of a month, clamped to that month's last day (31 -> 30 Apr, 28/29 Feb). */
const clampedDate = (ym: YearMonth, day: number): IsoDate =>
  toIso(ym.year, ym.month, Math.min(day, daysInMonth(ym)));

const assertDayOfMonth = (day: number, label: string): void => {
  if (!Number.isInteger(day) || day < MIN_DAY_OF_MONTH || day > MAX_DAY_OF_MONTH) {
    throw new RangeError(`${label} must be a whole day of the month 1-31, got ${day}`);
  }
};

/** The later of two ISO dates (ISO strings sort chronologically). */
const laterOf = (a: IsoDate, b: IsoDate): IsoDate => (a >= b ? a : b);

/**
 * Adds whole days to a calendar date (negative to go back).
 * @throws {RangeError} if `iso` is not a real `YYYY-MM-DD` date.
 */
export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromMs(parseIso(iso) + days * MS_PER_DAY);
}

/** The most recent statement date on or before `today` (a statement generated today counts). */
export function lastStatementDate(card: Card, today: IsoDate): IsoDate {
  assertDayOfMonth(card.statementDay, 'statementDay');
  const thisMonth = yearMonthOf(today);
  const candidate = clampedDate(thisMonth, card.statementDay);
  return candidate <= today ? candidate : clampedDate(shiftMonth(thisMonth, -1), card.statementDay);
}

/** The first statement date strictly after `today`. */
export function nextStatementDate(card: Card, today: IsoDate): IsoDate {
  assertDayOfMonth(card.statementDay, 'statementDay');
  const thisMonth = yearMonthOf(today);
  const candidate = clampedDate(thisMonth, card.statementDay);
  return candidate > today ? candidate : clampedDate(shiftMonth(thisMonth, 1), card.statementDay);
}

/** The first due-day date strictly after the statement date. */
const dueDateAfter = (statementDate: IsoDate, dueDay: number): IsoDate => {
  const statementMonth = yearMonthOf(statementDate);
  const candidate = clampedDate(statementMonth, dueDay);
  return candidate > statementDate ? candidate : clampedDate(shiftMonth(statementMonth, 1), dueDay);
};

/**
 * Where a card stands in its billing cycle on `today` (PRD §5.3 payment tracking):
 * remaining statement and minimum floored at 0, the due date (null when nothing is owed on
 * the last statement), and overdue = the due date has passed and paid < minimum.
 */
export function cardCycle(card: Card, today: IsoDate): CardCycle {
  assertDayOfMonth(card.dueDay, 'dueDay');
  const last = lastStatementDate(card, today);
  const remainingStatement = Math.max(0, card.lastStatementBalance - card.paidSinceStatement);
  const remainingMinimum = Math.max(0, card.minimumDue - card.paidSinceStatement);
  const dueDate = remainingStatement > 0 ? dueDateAfter(last, card.dueDay) : null;
  const isOverdue = dueDate !== null && today > dueDate && remainingMinimum > 0;
  return {
    cardId: card.id,
    lastStatementDate: last,
    nextStatementDate: nextStatementDate(card, today),
    dueDate,
    remainingStatement,
    remainingMinimum,
    isOverdue,
  };
}

/** The next weekly bureau snapshot strictly after `today`: the 7th, 14th, 21st, 28th or month-end. */
export function nextWeeklySnapshot(today: IsoDate): IsoDate {
  const thisMonth = yearMonthOf(today);
  const days = [...WEEKLY_SNAPSHOT_DAYS, daysInMonth(thisMonth)];
  const next = days
    .map((day) => clampedDate(thisMonth, day))
    .find((candidate) => candidate > today);
  return next ?? clampedDate(shiftMonth(thisMonth, 1), FIRST_WEEKLY_SNAPSHOT_DAY);
}

/**
 * Pay-by for a reporting point: the point minus the buffer days, never before today.
 * @throws {RangeError} if the buffer is not a non-negative whole number.
 */
export function payByFor(point: IsoDate, today: IsoDate, bufferDays: number): IsoDate {
  if (!Number.isInteger(bufferDays) || bufferDays < 0) {
    throw new RangeError(`payByBufferDays must be a non-negative whole number, got ${bufferDays}`);
  }
  return laterOf(addDays(point, -bufferDays), today);
}

/**
 * The next time this card's balance is reported, under the configured basis (PRD §5.4):
 * `statement` = the next statement date with the statement balance; `weekly_current` = the
 * next weekly snapshot with the current outstanding. Pay-by is one buffer before it.
 */
export function nextReportingPoint(card: Card, today: IsoDate, rules: CoachRules): ReportingPoint {
  const isWeekly = rules.reportingBasis === 'weekly_current';
  const date = isWeekly ? nextWeeklySnapshot(today) : nextStatementDate(card, today);
  return {
    cardId: card.id,
    basis: rules.reportingBasis,
    date,
    balance: isWeekly ? 'current' : 'statement',
    payBy: payByFor(date, today, rules.payByBufferDays),
  };
}
