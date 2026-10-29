import {
  DEFAULT_COACH_RULES,
  addDays,
  cardCycle,
  formatBeforeAfter,
  formatINR,
  formatPercent,
  formatRelativeDate,
  formatShortDate,
  nextReportingPoint,
  planPayments,
  type Card,
  type CoachRules,
  type Plan,
  type PlanItem,
} from '@credit-coach/engine';

import type { DemoCard, DemoPayment, DemoRules, IsoDate } from '../../demo/types';

export type StepState = 'primary' | 'secondary' | 'paid';

export interface StepView {
  step: number;
  id: string;
  cardId: string;
  cardName: string;
  kind: string;
  /** Rupees still to pay on this step (less than fullAmount when partly paid). */
  amount: number;
  fullAmount: number;
  amountLabel: string;
  payBy: IsoDate;
  payByLabel: string;
  isSoon: boolean;
  reason: string;
  before: number;
  after: number;
  barLabel: string;
  state: StepState;
  paidLabel?: string;
}

export interface LaneView {
  cardId: string;
  cardName: string;
  payBy?: { iso: string; label: string };
  due?: string;
  statement?: string;
}

export interface ShortfallView {
  cardId: string;
  text: string;
}

export interface PlanView {
  plan: Plan;
  steps: StepView[];
  lanes: LaneView[];
  timelineLabel: string;
  periodLabel: string;
  utilizationBefore: string;
  utilizationAfter: string;
  highestBefore: string;
  highestAfter: string;
  leftover: number;
  leftoverLabel: string;
  summary: string;
  shortfalls: ShortfallView[];
}

export interface PlanViewInput {
  cards: readonly DemoCard[];
  payments: readonly DemoPayment[];
  rules: DemoRules;
  cash: number;
  today: IsoDate;
  aimFor10: boolean;
}

const WINDOW_DAYS = 30;
/** A pay-by within this many days is "soon" (warning chip, `isSoon`). */
const SOON_DAYS = 1;

const KIND_LABEL: Record<PlanItem['kind'], string> = {
  overdue_minimum: 'PAY THE OVERDUE MINIMUM',
  minimum: 'PAY THE MINIMUM',
  statement: 'CLEAR THE STATEMENT',
  prepay: "LOWER BEFORE IT'S REPORTED",
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** `2026-10-21` -> `21 OCT`. */
export function dayMonthUpper(iso: IsoDate): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** `2026-10-22` -> `22 Oct`. */
export function shortDayMonth(iso: IsoDate): string {
  const upper = dayMonthUpper(iso);
  const [day, month = ''] = upper.split(' ');
  return `${day} ${month.charAt(0)}${month.slice(1).toLowerCase()}`;
}

function toEngineCard(card: DemoCard, paid: number): Card {
  return {
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    limit: card.limit,
    // The plan is built from the state before any recorded payment, so paid steps stay listed.
    outstanding: card.outstanding + paid,
    lastStatementBalance: card.lastStatementBalance,
    statementDay: card.statementDay,
    dueDay: card.dueDay ?? card.statementDay,
    minimumDue: card.minimumDue,
    paidSinceStatement: Math.max(0, card.paidSinceStatement - paid),
  };
}

function toEngineRules(rules: DemoRules, aimFor10: boolean): CoachRules {
  return {
    ...DEFAULT_COACH_RULES,
    thresholdPct: rules.thresholdPct,
    excellentPct: rules.excellentPct,
    reportingBasis: rules.reportingBasis,
    aimFor10,
  };
}

interface PaymentRun {
  total: number;
  /** Running totals with the date of the payment that reached them. */
  cumulative: { total: number; date: IsoDate }[];
}

function paymentRuns(payments: readonly DemoPayment[]): Map<string, PaymentRun> {
  const runs = new Map<string, PaymentRun>();
  for (const payment of payments) {
    const run = runs.get(payment.cardId) ?? { total: 0, cumulative: [] };
    run.total += payment.amount;
    run.cumulative.push({ total: run.total, date: payment.date });
    runs.set(payment.cardId, run);
  }
  return runs;
}

function payByLabel(payBy: IsoDate, today: IsoDate): string {
  const relative = formatRelativeDate(payBy, today);
  const text = relative === 'today' || relative === 'tomorrow' ? relative : formatShortDate(payBy);
  return `BY ${text.toUpperCase()}`;
}

/** ISO dates sort chronologically as plain strings; an explicit comparator keeps that order. */
function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Earliest pay-by first, ties by step number. */
export function compareSteps(a: StepView, b: StepView): number {
  return compareIso(a.payBy, b.payBy) || a.step - b.step;
}

/** The largest cash figure the plan accepts: nine digits, the same limit as the deep-link param. */
export const MAX_CASH = 999_999_999;

/** The cash text on the Plan screen as rupees; empty means zero. */
export function parseCash(text: string): number {
  return text === '' ? 0 : Number(text);
}

/**
 * The Plan screen shows cash left to pay with; the plan itself uses cash at plan time, which is
 * what was typed plus what is already recorded. Refuses a total above MAX_CASH.
 */
export function applyCashEdit(
  digits: string,
  paidTotal: number,
): { cashText: string } | { error: string } {
  const cash = Number(digits || 0) + paidTotal;
  if (!Number.isFinite(cash) || cash > MAX_CASH) {
    return { error: `Enter ${formatINR(MAX_CASH)} or less.` };
  }
  return { cashText: String(cash) };
}

/** How much of a step a card's payments have covered: settled, or what is still to pay. */
function settle(
  run: PaymentRun | undefined,
  start: number,
  end: number,
  full: number,
): { settled: boolean; amount: number; paidDate?: IsoDate } {
  const paidTotal = run?.total ?? 0;
  if (paidTotal >= end) {
    return {
      settled: true,
      amount: full,
      paidDate: run?.cumulative.find((c) => c.total >= end)?.date,
    };
  }
  return { settled: false, amount: Math.min(full, end - Math.max(paidTotal, start)) };
}

function buildSteps(
  plan: Plan,
  cardsById: Map<string, DemoCard>,
  runs: Map<string, PaymentRun>,
  today: IsoDate,
): StepView[] {
  const endOfCard = new Map<string, number>();
  const steps: StepView[] = plan.items.map((item) => {
    const start = endOfCard.get(item.cardId) ?? 0;
    const end = start + item.amount;
    endOfCard.set(item.cardId, end);
    const { settled, amount, paidDate } = settle(runs.get(item.cardId), start, end, item.amount);
    return {
      step: item.step,
      id: `plan-step-${item.step}`,
      cardId: item.cardId,
      cardName: cardsById.get(item.cardId)?.name ?? item.cardId,
      kind: KIND_LABEL[item.kind],
      amount,
      fullAmount: item.amount,
      amountLabel: formatINR(amount),
      payBy: item.payBy,
      payByLabel: payByLabel(item.payBy, today),
      isSoon: item.payBy <= addDays(today, SOON_DAYS),
      reason: item.reason.text,
      before: item.utilizationBefore ?? 0,
      after: item.utilizationAfter ?? 0,
      barLabel: formatBeforeAfter(
        formatPercent(item.utilizationBefore ?? 0),
        formatPercent(item.utilizationAfter ?? 0),
      ),
      state: settled ? 'paid' : 'secondary',
      paidLabel: paidDate ? dayMonthUpper(paidDate) : undefined,
    };
  });
  const primary = steps.filter((s) => s.state !== 'paid').sort(compareSteps)[0];
  if (primary) primary.state = 'primary';
  return steps;
}

function buildLanes(
  steps: StepView[],
  cards: readonly Card[],
  rules: CoachRules,
  today: IsoDate,
): LaneView[] {
  return cards.map((card) => {
    const open = steps.filter((s) => s.cardId === card.id && s.state !== 'paid');
    const earliest = open.map((s) => s.payBy).sort(compareIso)[0];
    const cycle = cardCycle(card, today);
    const lane: LaneView = {
      cardId: card.id,
      cardName: card.name,
      statement: nextReportingPoint(card, today, rules).date,
    };
    if (earliest) {
      const sum = open.filter((s) => s.payBy === earliest).reduce((t, s) => t + s.amount, 0);
      lane.payBy = { iso: earliest, label: `${formatINR(sum)} · ${shortDayMonth(earliest)}` };
    }
    if (cycle.dueDate) lane.due = cycle.dueDate;
    return lane;
  });
}

function laneSentence(lane: LaneView): string {
  const parts: string[] = [];
  if (lane.payBy) parts.push(`pay ${lane.payBy.label}`);
  if (lane.due) parts.push(`due ${shortDayMonth(lane.due)}`);
  else parts.push('nothing due this cycle');
  if (lane.statement) parts.push(`reported ${shortDayMonth(lane.statement)}`);
  return `${lane.cardName}: ${parts.join(', ')}.`;
}

function shortfallText(
  plan: Plan,
  cardsById: Map<string, DemoCard>,
  runs: Map<string, PaymentRun>,
): ShortfallView[] {
  return plan.shortfalls
    .flatMap((s) => {
      // Money the user has recorded on this card counts, even if the cash figure could not fund it.
      const covered = Math.max(s.funded, runs.get(s.cardId)?.total ?? 0);
      const short = Math.max(0, s.required - covered);
      return short > 0 ? [{ ...s, shortfall: short }] : [];
    })
    .map((s) => ({
      cardId: s.cardId,
      text: `${cardsById.get(s.cardId)?.name ?? s.cardId}: ${formatINR(s.shortfall)} short of the ${formatINR(s.required)} minimum due ${formatShortDate(s.dueDate)}. Your cash covers ${formatINR(s.funded)}. Pay the rest by the due date to avoid a missed payment.`,
    }));
}

const pct = (value: number | null): string => (value === null ? 'N/A' : formatPercent(value));

/**
 * Recomputes the plan from the repository's current state every call (PRD 5.3, never a frozen
 * object). Recorded payments are added back to build the plan as it stood, so a paid step stays
 * listed (collapsed) rather than vanishing; each card's payments settle its steps in order.
 */
export function buildPlanView(input: PlanViewInput): PlanView {
  const { today } = input;
  const runs = paymentRuns(input.payments);
  const cardsById = new Map(input.cards.map((c) => [c.id, c]));
  const engineCards = input.cards.map((c) => toEngineCard(c, runs.get(c.id)?.total ?? 0));
  const rules = toEngineRules(input.rules, input.aimFor10);
  const plan = planPayments({ cards: engineCards, cash: input.cash, today, rules });
  const steps = buildSteps(plan, cardsById, runs, today);
  const lanes = buildLanes(steps, engineCards, rules, today);
  // Payments beyond what the plan asked of a card come out of what is left over.
  // Every card with a recorded payment counts, including cards the plan does not touch.
  let extra = 0;
  for (const [cardId, run] of runs) {
    const planned = plan.items.filter((i) => i.cardId === cardId).reduce((a, i) => a + i.amount, 0);
    extra += Math.max(0, run.total - planned);
  }
  const leftover = Math.max(0, plan.leftover - extra);
  return {
    plan,
    steps,
    lanes,
    timelineLabel: `Next 30 days. ${lanes.map((l) => laneSentence(l)).join(' ')}`,
    periodLabel: `${dayMonthUpper(today)} → ${dayMonthUpper(addDays(today, WINDOW_DAYS))}`,
    utilizationBefore: pct(plan.overallUtilizationBefore),
    utilizationAfter: pct(plan.overallUtilizationAfter),
    highestBefore: pct(plan.highestCardBefore),
    highestAfter: pct(plan.highestCardAfter),
    leftover,
    leftoverLabel: formatINR(leftover),
    summary: plan.summary.text,
    shortfalls: shortfallText(plan, cardsById, runs),
  };
}
