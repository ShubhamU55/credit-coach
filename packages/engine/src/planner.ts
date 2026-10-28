import {
  NOTHING_MORE_NEEDED,
  minimumReason,
  overdueReason,
  prepayReason,
  statementReason,
  summaryReason,
  type PrepayOutcome,
} from './planner.reasons';
import { addDays, cardCycle, nextReportingPoint } from './reporting';
import { PLANNER_STEPS } from './types';
import type {
  Card,
  CardCycle,
  CoachRules,
  IsoDate,
  Plan,
  PlanInput,
  PlanItem,
  PlannerStep,
  Reason,
  ReportingPoint,
  Rupees,
  Shortfall,
} from './types';
import { overallUtilization, utilization } from './utilization';

const PERCENT = 100;

/** A card's running state while the plan is built. Local and mutable; the input is never touched. */
interface CardState {
  card: Card;
  cycle: CardCycle;
  point: ReportingPoint;
  /** Running outstanding; a negative (credit) balance starts at 0. */
  outstanding: Rupees;
  /** Paid by earlier items of this plan; counts towards the minimum and the statement. */
  paidInPlan: Rupees;
  hasValidLimit: boolean;
}

/** Shared state for one planning run. */
interface Run {
  today: IsoDate;
  rules: CoachRules;
  /** Cash still unallocated. */
  cash: Rupees;
  items: Omit<PlanItem, 'step'>[];
  shortfalls: Shortfall[];
}

const isValidLimit = (limit: number): boolean => Number.isFinite(limit) && limit > 0;

const byId = (a: Card, b: Card): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const earlierOf = (a: IsoDate, b: IsoDate): IsoDate => (a <= b ? a : b);
const laterOf = (a: IsoDate, b: IsoDate): IsoDate => (a >= b ? a : b);

const utilOf = (s: CardState): number | null => utilization(s.outstanding, s.card.limit);

/** Utilization for a card already filtered to a valid limit; a null here is a planner bug. */
const validUtil = (outstanding: Rupees, s: CardState): number => {
  const pct = utilization(outstanding, s.card.limit);
  if (pct === null) throw new Error(`planner invariant: ${s.card.id} has no valid limit`);
  return pct;
};

/** A card's step-4 pre-payment so far, and its outstanding when step 4 began. */
interface Prepaid {
  amount: Rupees;
  outstandingBefore: Rupees;
}

/** Percentages are resolved to hundredths of a percent before any rupee math. */
const PCT_SCALE = 100;

/**
 * The most a card may carry and stay at or under `pct`, in whole rupees. The percentage is
 * scaled to integer hundredths first, so `3000 × 33.3%` is exactly 999 rather than the float
 * 998.9999999999999. The integer product stays exact while limit × 10,000 < 2^53 (limits up to
 * about ₹9 lakh crore).
 */
const capAt = (s: CardState, pct: number): Rupees => {
  const pctHundredths = Math.round(pct * PCT_SCALE);
  return Math.floor((s.card.limit * pctHundredths) / (PERCENT * PCT_SCALE));
};

/**
 * The cycle's due date. Only called for a card that owes a minimum or statement balance, which
 * always has one; a null here is a planner bug, so it fails loudly instead of guessing a date.
 */
const dueOf = (s: CardState): IsoDate => {
  if (s.cycle.dueDate === null) throw new Error(`planner invariant: ${s.card.id} has no due date`);
  return s.cycle.dueDate;
};

const owedMinimum = (s: CardState): Rupees =>
  s.cycle.dueDate === null
    ? 0
    : Math.max(0, Math.min(s.cycle.remainingMinimum - s.paidInPlan, s.outstanding));

const owedStatement = (s: CardState): Rupees =>
  s.cycle.dueDate === null
    ? 0
    : Math.max(0, Math.min(s.cycle.remainingStatement - s.paidInPlan, s.outstanding));

const byDueDate = (a: CardState, b: CardState): number =>
  dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : byId(a.card, b.card);

/** Step 3 order: highest known interest rate first (unknown after known), then earliest due date. */
const byRateThenDueDate = (a: CardState, b: CardState): number => {
  const rateGap = (b.card.interestRatePct ?? -1) - (a.card.interestRatePct ?? -1);
  return rateGap !== 0 ? rateGap : byDueDate(a, b);
};

/** Step 4 order: highest utilization first (exact ratio, not the rounded display value). */
const byUtilizationDesc = (a: CardState, b: CardState): number => {
  const gap = b.outstanding / b.card.limit - a.outstanding / a.card.limit;
  return gap !== 0 ? gap : byId(a.card, b.card);
};

/** weekly_current: the earlier of the due date and the snapshot pay-by, never before today. */
const weeklyPayBy = (s: CardState, run: Run): IsoDate =>
  s.cycle.dueDate === null
    ? s.point.payBy
    : laterOf(earlierOf(s.cycle.dueDate, s.point.payBy), run.today);

const statementPayBy = (s: CardState, run: Run): IsoDate =>
  run.rules.reportingBasis === 'statement' ? laterOf(dueOf(s), run.today) : weeklyPayBy(s, run);

const prepayPayBy = (s: CardState, run: Run): IsoDate =>
  run.rules.reportingBasis === 'statement' ? s.point.payBy : weeklyPayBy(s, run);

/**
 * While a card still owes part of its minimum (before this item), no item on it may pay by later
 * than its due date (never before today). With a reordered step order a prepay or statement item
 * can run before the minimum step and absorb the minimum; its pay-by must then keep that deadline.
 */
const keepDueDeadline = (s: CardState, run: Run, payBy: IsoDate): IsoDate => {
  const owesMinimum = s.cycle.dueDate !== null && s.cycle.remainingMinimum - s.paidInPlan > 0;
  return owesMinimum ? laterOf(earlierOf(payBy, dueOf(s)), run.today) : payBy;
};

function pay(
  run: Run,
  s: CardState,
  item: { kind: PlanItem['kind']; amount: Rupees; payBy: IsoDate; reason: Reason },
): void {
  const utilizationBefore = utilOf(s);
  const payBy = keepDueDeadline(s, run, item.payBy);
  s.outstanding -= item.amount;
  s.paidInPlan += item.amount;
  run.cash -= item.amount;
  run.items.push({
    ...item,
    payBy,
    cardId: s.card.id,
    utilizationBefore,
    utilizationAfter: utilOf(s),
  });
}

/** Steps 1 and 2: fund minimums in due-date order; record every minimum the cash cannot cover. */
function payMinimums(run: Run, states: CardState[], overdue: boolean): void {
  const owing = states
    .filter((s) => s.cycle.isOverdue === overdue && owedMinimum(s) > 0)
    .sort(byDueDate);
  for (const s of owing) {
    const required = owedMinimum(s);
    const funded = Math.min(run.cash, required);
    const dueDate = dueOf(s);
    if (funded > 0) {
      pay(run, s, {
        kind: overdue ? 'overdue_minimum' : 'minimum',
        amount: funded,
        payBy: overdue ? run.today : dueDate,
        reason: overdue ? overdueReason(dueDate) : minimumReason(dueDate, run.today),
      });
    }
    if (funded < required) {
      const kind = overdue ? 'overdue_minimum' : 'minimum';
      run.shortfalls.push({
        cardId: s.card.id,
        kind,
        required,
        funded,
        shortfall: required - funded,
        dueDate,
      });
    }
  }
}

/** Step 3: the rest of each statement balance, to avoid interest. */
function payStatements(run: Run, states: CardState[]): void {
  const owing = states.filter((s) => owedStatement(s) > 0).sort(byRateThenDueDate);
  for (const s of owing) {
    const owed = owedStatement(s);
    const amount = Math.min(run.cash, owed);
    if (amount <= 0) return;
    pay(run, s, {
      kind: 'statement',
      amount,
      payBy: statementPayBy(s, run),
      reason: statementReason(run.today > dueOf(s), amount === owed),
    });
  }
}

/** Greedy: pay the highest-utilization card down to `pct`, then the next-highest, until cash runs out. */
function lowerTo(run: Run, states: CardState[], pct: number, paid: Map<CardState, Prepaid>): void {
  const above = states.filter((s) => s.outstanding > capAt(s, pct)).sort(byUtilizationDesc);
  for (const s of above) {
    const amount = Math.min(run.cash, s.outstanding - capAt(s, pct));
    if (amount <= 0) return;
    const sofar = paid.get(s) ?? { amount: 0, outstandingBefore: s.outstanding };
    paid.set(s, { ...sofar, amount: sofar.amount + amount });
    s.outstanding -= amount;
    run.cash -= amount;
  }
}

/** 'excellent' only when the card ends at or under both lines (the excellent line may be set higher). */
const prepayOutcome = (s: CardState, rules: CoachRules): PrepayOutcome => {
  const withinThreshold = s.outstanding <= capAt(s, rules.thresholdPct);
  if (rules.aimFor10 && withinThreshold && s.outstanding <= capAt(s, rules.excellentPct)) {
    return 'excellent';
  }
  return withinThreshold ? 'threshold' : 'partial';
};

/**
 * Step 4: lower utilization before the next reporting point. Phase (a) stops at the threshold;
 * phase (b), only with "Aim for 10%" on, continues toward the excellent line. One item per card.
 */
function prepay(run: Run, states: CardState[]): void {
  const eligible = states.filter((s) => s.hasValidLimit);
  const paid = new Map<CardState, Prepaid>();
  lowerTo(run, eligible, run.rules.thresholdPct, paid);
  if (run.rules.aimFor10) lowerTo(run, eligible, run.rules.excellentPct, paid);

  for (const [s, { amount, outstandingBefore }] of paid) {
    const utilizationBefore = validUtil(outstandingBefore, s);
    const utilizationAfter = validUtil(s.outstanding, s);
    const payBy = keepDueDeadline(s, run, prepayPayBy(s, run));
    s.paidInPlan += amount;
    run.items.push({
      kind: 'prepay',
      cardId: s.card.id,
      amount,
      payBy,
      reason: prepayReason(
        prepayOutcome(s, run.rules),
        s.point.date,
        { outstanding: outstandingBefore, utilization: utilizationBefore },
        { outstanding: s.outstanding, utilization: utilizationAfter },
      ),
      utilizationBefore,
      utilizationAfter,
    });
  }
}

const STEP_RUNNERS: Record<PlannerStep, (run: Run, states: CardState[]) => void> = {
  overdue: (run, states) => payMinimums(run, states, true),
  minimum: (run, states) => payMinimums(run, states, false),
  statement: payStatements,
  prepay,
};

const assertWholeRupees = (value: number, label: string, allowNegative = false): void => {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new RangeError(
      `${label} must be ${allowNegative ? 'a' : 'a non-negative'} whole number of rupees, got ${value}`,
    );
  }
};

const assertPercent = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > PERCENT) {
    throw new RangeError(`${label} must be a percentage 0-100, got ${value}`);
  }
};

function assertRules(rules: CoachRules): void {
  assertPercent(rules.thresholdPct, 'thresholdPct');
  assertPercent(rules.excellentPct, 'excellentPct');
  const order = rules.plannerStepOrder;
  const isPermutation =
    order.length === PLANNER_STEPS.length && PLANNER_STEPS.every((step) => order.includes(step));
  if (!isPermutation) {
    throw new RangeError(`plannerStepOrder must list each of ${PLANNER_STEPS.join(', ')} once`);
  }
}

function assertCard(card: Card): void {
  assertWholeRupees(card.outstanding, `${card.id}.outstanding`, true);
  assertWholeRupees(card.lastStatementBalance, `${card.id}.lastStatementBalance`);
  assertWholeRupees(card.minimumDue, `${card.id}.minimumDue`);
  assertWholeRupees(card.paidSinceStatement, `${card.id}.paidSinceStatement`);
  const rate = card.interestRatePct;
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0)) {
    throw new RangeError(`${card.id}.interestRatePct must be a non-negative number, got ${rate}`);
  }
}

/** Malformed input is a caller bug (boundaries validate first), so it throws a `RangeError`. */
function assertInput(input: PlanInput): void {
  assertWholeRupees(input.cash, 'cash');
  addDays(input.today, 0);
  assertRules(input.rules);
  const ids = new Set(input.cards.map((c) => c.id));
  if (ids.size !== input.cards.length) throw new RangeError('card ids must be unique');
  input.cards.forEach(assertCard);
}

const toState = (card: Card, today: IsoDate, rules: CoachRules): CardState => ({
  card,
  cycle: cardCycle(card, today),
  point: nextReportingPoint(card, today, rules),
  outstanding: Math.max(0, card.outstanding),
  paidInPlan: 0,
  hasValidLimit: isValidLimit(card.limit),
});

const highestCard = (states: CardState[], outstanding: (s: CardState) => Rupees): number | null => {
  const utils = states.filter((s) => s.hasValidLimit).map((s) => validUtil(outstanding(s), s));
  return utils.length === 0 ? null : Math.max(...utils);
};

const overallOf = (states: CardState[], outstanding: (s: CardState) => Rupees): number | null =>
  overallUtilization(states.map((s) => ({ outstanding: outstanding(s), limit: s.card.limit })));

/**
 * Plans how to spend `cash` across the cards (PRD §5.3), in priority order: overdue minimums
 * (always first), minimums by due date, statement balances, then utilization pre-payments before
 * the next reporting point (§5.4). Deterministic and independent of card order (ties break on id).
 * Never pays more than a card's outstanding; never hides a shortfall.
 * @throws {RangeError} on malformed input (negative or fractional rupees, bad dates, duplicate ids).
 */
export function planPayments(input: PlanInput): Plan {
  assertInput(input);
  const { today, rules } = input;
  const states = [...input.cards].sort(byId).map((card) => toState(card, today, rules));
  const startOutstanding = (s: CardState): Rupees => Math.max(0, s.card.outstanding);
  const run: Run = { today, rules, cash: input.cash, items: [], shortfalls: [] };

  const order: PlannerStep[] = [
    'overdue',
    ...rules.plannerStepOrder.filter((s) => s !== 'overdue'),
  ];
  for (const step of order) STEP_RUNNERS[step](run, states);

  const withinThreshold =
    run.shortfalls.length === 0 &&
    states.every((s) => !s.hasValidLimit || s.outstanding <= capAt(s, rules.thresholdPct));
  return {
    items: run.items.map((item, i) => ({ step: i + 1, ...item })),
    shortfalls: run.shortfalls,
    leftover: run.cash,
    leftoverReason: run.cash > 0 ? NOTHING_MORE_NEEDED : null,
    overallUtilizationBefore: overallOf(states, startOutstanding),
    overallUtilizationAfter: overallOf(states, (s) => s.outstanding),
    highestCardBefore: highestCard(states, startOutstanding),
    highestCardAfter: highestCard(states, (s) => s.outstanding),
    withinThreshold,
    summary: summaryReason(run.shortfalls.length, withinThreshold, rules.thresholdPct),
    excludedCardIds: states.filter((s) => !s.hasValidLimit).map((s) => s.card.id),
  };
}
