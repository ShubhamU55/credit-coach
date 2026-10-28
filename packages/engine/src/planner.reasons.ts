import { formatINR } from './format';
import { addDays } from './reporting';
import type { IsoDate, Reason, Rupees } from './types';

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

/** `2026-11-04` -> `4 Nov`, the short form used inside reason sentences. */
const dayMonth = (iso: IsoDate): string => {
  const [, month, day] = iso.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTH_NAMES[month - 1]}`;
};

/** `30` -> `30%`, `18.7` -> `18.7%` (1 dp, a trailing `.0` dropped). */
const percent = (value: number): string => `${Number(value.toFixed(1))}%`;

const MISSED_PAYMENT = 'Missing it is the most damaging thing for your score.';

export const overdueReason = (dueDate: IsoDate): Reason => ({
  code: 'overdue',
  text: `This minimum was due on ${dayMonth(dueDate)} and is unpaid. A missed payment is the most damaging event for your score.`,
});

export function minimumReason(dueDate: IsoDate, today: IsoDate): Reason {
  if (dueDate === today) {
    return { code: 'minimum_due_soon', text: `Your minimum is due today. ${MISSED_PAYMENT}` };
  }
  if (dueDate === addDays(today, 1)) {
    return { code: 'minimum_due_soon', text: `Your minimum is due tomorrow. ${MISSED_PAYMENT}` };
  }
  return { code: 'minimum_due', text: `Minimum due on ${dayMonth(dueDate)}.` };
}

export function statementReason(isPastDue: boolean, clearsStatement: boolean): Reason {
  if (isPastDue) {
    return {
      code: 'statement_after_due',
      text: 'The due date has passed. Clearing the rest of the statement stops more interest building up.',
    };
  }
  if (clearsStatement) {
    return { code: 'statement_full', text: 'Pays off the full statement, so no interest.' };
  }
  return {
    code: 'statement_partial',
    text: 'Pays part of the statement. Interest is charged on what stays unpaid.',
  };
}

/** Where a pre-payment leaves a card relative to the planner's targets. */
export type PrepayOutcome = 'excellent' | 'threshold' | 'partial';

export interface ReportedBalance {
  outstanding: Rupees;
  /** Card utilization %, 1 dp. */
  utilization: number;
}

export function prepayReason(
  outcome: PrepayOutcome,
  reportingDate: IsoDate,
  before: ReportedBalance,
  after: ReportedBalance,
): Reason {
  const code =
    outcome === 'excellent'
      ? 'prepay_excellent'
      : outcome === 'threshold'
        ? 'prepay_threshold'
        : 'prepay_partial';
  return {
    code,
    text:
      `Pay before ${dayMonth(reportingDate)} so ${formatINR(after.outstanding)} ` +
      `(${percent(after.utilization)}) gets reported instead of ` +
      `${formatINR(before.outstanding)} (${percent(before.utilization)}).`,
  };
}

export const NOTHING_MORE_NEEDED: Reason = {
  code: 'nothing_more_needed',
  text: 'Nothing more needed this cycle.',
};

export function summaryReason(
  missedMinimums: number,
  withinThreshold: boolean,
  thresholdPct: number,
): Reason {
  if (missedMinimums > 0) {
    const who =
      missedMinimums === 1
        ? '1 card will miss its minimum'
        : `${missedMinimums} cards will miss theirs`;
    return {
      code: 'shortfall',
      text: `This cash does not cover every minimum: ${who}.`,
    };
  }
  if (withinThreshold) {
    return {
      code: 'all_within_threshold',
      text: `Every card ends at or under ${percent(thresholdPct)}.`,
    };
  }
  return {
    code: 'above_threshold',
    text: `Some cards stay above ${percent(thresholdPct)} this cycle.`,
  };
}
