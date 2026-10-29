import {
  DEFAULT_COACH_RULES,
  cardCycle,
  formatBeforeAfter,
  formatINR,
  formatPercent,
  formatScoreRange,
  formatShortDate,
  overallUtilization,
  planPayments,
  predictScore,
  utilization,
  type Card,
  type CoachRules,
  type PlanItem,
  type PlanItemKind,
} from '@credit-coach/engine';

import type { DemoCard, DemoPayment, DemoProfile, DemoRules, IsoDate } from '../../demo/types';
import { finishForIndex, type CardFinish, type DateBlockItem } from '../../ui';

/**
 * Adapter from the plain demo data to the engine, and from the engine's answers to what Home
 * shows. Pure: "today" and all rules are passed in, nothing here reads the clock. Every number
 * and date on Home comes from the engine; this file only picks and formats them.
 */

export interface HomeModelInput {
  profile: DemoProfile;
  cards: readonly DemoCard[];
  rules: DemoRules;
  payments: readonly DemoPayment[];
  today: IsoDate;
}

export interface CardTileModel {
  id: string;
  name: string;
  finish: CardFinish;
  utilPercent: number;
  line: string;
}

export interface HeroModel {
  cardId: string;
  cardName: string;
  finish: CardFinish;
  dueChip: string;
  /** The bold date in the sentence, for example `Thu, 22 Oct`; `Due date unknown` when none is known. */
  dateText: string;
  /** True when the card has no due date on file: no "By <date>" is shown (PRD F1). */
  dateUnknown: boolean;
  /** The sentence between the bold date and the bold ending, starting with " — ". */
  middleText: string;
  /** The bold ending, for example `zero interest.`; empty when there is none. */
  emphasisText: string;
  amount: string;
  clearsStatement: boolean;
  minimumLine: string;
}

export interface ScoreModel {
  range: string;
  band: string;
  withPlanRange: string | null;
  /** Where the range midpoint sits on the 300-900 scale, in percent (for the tile bar and tick). */
  barPercent: number;
  targetPercent: number;
}

export interface HomeModel {
  firstName: string;
  initials: string;
  isSample: boolean;
  threshold: number;
  overall: { pct: number; outstanding: number; limit: number } | null;
  overallAfter: number | null;
  /** The utilization tile, already formatted. */
  utilTile: { value: string; over: boolean; caption: string; delta: string | undefined };
  cards: CardTileModel[];
  /** Cards with a zero or missing limit: left out of utilization and flagged (PRD 5.2). */
  excluded: { id: string; name: string }[];
  hero: HeroModel | null;
  comingUp: DateBlockItem[];
  /**
   * A "step" on Home is one payment to one card (its minimum and statement steps together).
   * `stepsTotal` = cards still in the plan + cards that were paid off; `stepsDone` = the paid off.
   * PD-9 will share one source for this with the Plan screen.
   */
  stepsTotal: number;
  stepsDone: number;
  /** Number of items left in the plan (the "All N steps" link). */
  planItemCount: number;
  /** Null when no card has a usable limit: no estimate is built from nothing (non-negotiable 3). */
  score: ScoreModel | null;
  /** True when at least one card counts towards utilization. */
  hasCards: boolean;
  /** Shown instead of the hero when there is nothing to pay. */
  nothingToDo: string | null;
}

const KIND_LABEL: Record<PlanItemKind, string> = {
  overdue_minimum: 'Pay the overdue minimum',
  minimum: 'Pay the minimum',
  statement: 'Clear the statement',
  prepay: "Lower before it's reported",
};

export const DUE_UNKNOWN = 'due date unknown';
export const NO_CARDS_TEXT = 'Add a card with a limit to see your plan.';
export const NOTHING_TO_PAY_TEXT = 'Nothing left to pay right now.';
export const NO_ESTIMATE_TEXT = 'Add a card with a limit to see an estimate.';

/** The first letters of the first two words of the name; a trailing "(sample)" tag is ignored. */
export function initialsOf(name: string): string {
  const initials = name
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    // Array.from keeps a character outside the basic plane whole instead of splitting it.
    .map((word) => (Array.from(word)[0] ?? '').toUpperCase())
    .join('');
  return initials || '?';
}

const validLimit = (limit: number): boolean => Number.isFinite(limit) && limit > 0;

/** Demo cards to engine cards. A missing limit becomes 0 so the engine excludes the card. */
export function toEngineCards(cards: readonly DemoCard[]): Card[] {
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    limit: validLimit(card.limit) ? card.limit : 0,
    outstanding: card.outstanding,
    lastStatementBalance: card.lastStatementBalance,
    statementDay: card.statementDay,
    // The engine needs a day. cardLine never shows a due date for a card whose dueDay is null.
    dueDay: card.dueDay ?? card.statementDay,
    minimumDue: card.minimumDue,
    paidSinceStatement: card.paidSinceStatement,
  }));
}

export function toEngineRules(rules: DemoRules): CoachRules {
  return {
    ...DEFAULT_COACH_RULES,
    thresholdPct: rules.thresholdPct,
    excellentPct: rules.excellentPct,
    reportingBasis: rules.reportingBasis,
    aimFor10: rules.aimFor10,
  };
}

/** `Thu, 22 Oct` to its `Thu`, `22` and `Oct`. */
export function dateParts(iso: IsoDate): { day: string; date: string; month: string } {
  const [day, date, month] = formatShortDate(iso).split(/[, ]+/);
  return { day, date, month };
}

const dayAndMonth = (iso: IsoDate): string => {
  const { date, month } = dateParts(iso);
  return `${date} ${month}`;
};

function reasonLine(item: PlanItem, dateUnknown: boolean): string {
  const label = KIND_LABEL[item.kind];
  if (item.utilizationBefore === null || item.utilizationAfter === null) return label;
  const change = formatBeforeAfter(
    formatPercent(item.utilizationBefore),
    formatPercent(item.utilizationAfter),
  );
  return dateUnknown ? `${label} · ${DUE_UNKNOWN} · ${change}` : `${label} · ${change}`;
}

/**
 * The hero is one payment: the earliest pay-by date (ties keep the planner's order) and every item
 * for that card on that same date. The date, the amount and the sentence all come from that one
 * set, so a prepay's date is never mixed with another step's amount.
 */
function buildHero(
  items: readonly PlanItem[],
  engineCards: readonly Card[],
  finishById: ReadonlyMap<string, CardFinish>,
  today: IsoDate,
  isUnknown: (item: PlanItem) => boolean,
): { hero: HeroModel; heroItems: Set<PlanItem> } | null {
  // An owed payment with no known due date comes first (it is the one we cannot schedule), then
  // the earliest pay-by date.
  const first = [...items].sort(
    (a, b) => Number(isUnknown(b)) - Number(isUnknown(a)) || a.payBy.localeCompare(b.payBy),
  )[0];
  if (!first) return null;
  const card = engineCards.find((c) => c.id === first.cardId);
  if (!card) return null;
  const cycle = cardCycle(card, today);
  const heroItems = new Set(
    items.filter((item) => item.cardId === first.cardId && item.payBy === first.payBy),
  );
  const planned = [...heroItems].reduce((sum, item) => sum + item.amount, 0);
  const paysStatement = [...heroItems].some((item) => item.kind === 'statement');
  const clearsStatement =
    paysStatement && cycle.remainingStatement > 0 && planned >= cycle.remainingStatement;
  const amount = clearsStatement ? cycle.remainingStatement : planned;
  const dateUnknown = isUnknown(first);
  const dateText = dateUnknown ? 'Due date unknown' : formatShortDate(first.payBy);
  const paysMinimum = [...heroItems].some(
    (item) =>
      item.kind === 'minimum' || item.kind === 'overdue_minimum' || item.kind === 'statement',
  );
  const minimumLine =
    paysMinimum && cycle.remainingMinimum > 0
      ? `${formatINR(Math.min(cycle.remainingMinimum, amount))} of it is your minimum.`
      : 'No minimum is due on this payment.';
  return {
    heroItems,
    hero: {
      cardId: card.id,
      cardName: card.name,
      finish: finishById.get(card.id) ?? 'graphite',
      dueChip: dateUnknown ? 'DUE DATE UNKNOWN' : `BY ${dateText.toUpperCase()}`,
      dateText,
      dateUnknown,
      middleText: clearsStatement
        ? ' — clears your full statement, so '
        : ` — ${first.reason.text}`,
      emphasisText: clearsStatement ? 'zero interest.' : '',
      amount: formatINR(amount),
      clearsStatement,
      minimumLine,
    },
  };
}

function cardLine(card: Card, demo: DemoCard | undefined, today: IsoDate): string {
  const cycle = cardCycle(card, today);
  let due = 'nothing due';
  if (cycle.remainingStatement > 0) {
    // A null dueDay with a balance owed means the due date is unknown: never invent one.
    due =
      demo?.dueDay === null || cycle.dueDate === null
        ? 'due date unknown'
        : `due ${dayAndMonth(cycle.dueDate)}`;
  }
  const balance = `${formatINR(card.outstanding)} / ${formatINR(card.limit)}`;
  return `${balance} · ${due} · statement ${dayAndMonth(cycle.nextStatementDate)}`;
}

function estimate(input: HomeModelInput, overallPct: number, maxPct: number, openAccounts: number) {
  const { history } = input.profile;
  return predictScore({
    anchor: { score: history.anchorScore, date: history.anchorDate },
    today: input.today,
    onTimePayments: history.monthsWithZeroMissed,
    missedPayments: history.missedPayments,
    overallUtilizationPct: overallPct,
    maxCardUtilizationPct: maxPct,
    hardInquiries6m: history.hardInquiries6m,
    hardInquiries12m: history.hardInquiries12m,
    oldestAccountMonths: history.oldestAccountMonths,
    openAccounts,
    securedAccounts: history.securedAccounts,
    unsecuredAccounts: history.unsecuredAccounts,
  });
}

/** The midpoint of a score range as a percent of the 300-900 scale. */
export function scalePercent(low: number, high: number): number {
  const percent = ((low + high) / 2 - 300) / 6;
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

export function buildHomeModel(input: HomeModelInput): HomeModel {
  const { profile, rules, payments, today } = input;
  const engineCards = toEngineCards(input.cards);
  const plan = planPayments({
    cards: engineCards,
    cash: profile.cashForCards,
    today,
    rules: toEngineRules(rules),
  });

  const finishById = new Map(engineCards.map((c, i) => [c.id, finishForIndex(i)] as const));
  const demoById = new Map(input.cards.map((c) => [c.id, c] as const));
  const counted = engineCards.filter((c) => validLimit(c.limit));
  const excluded = engineCards
    .filter((c) => !validLimit(c.limit))
    .map((c) => ({ id: c.id, name: c.name }));
  const hasCards = counted.length > 0;

  const overallPct = overallUtilization(counted);
  // A card with no due day on file gets a stand-in day for the engine; its minimum and statement
  // dates are not real and must never be shown.
  const unknownDueIds = new Set(input.cards.filter((c) => c.dueDay === null).map((c) => c.id));
  const isUnknown = (item: PlanItem) => unknownDueIds.has(item.cardId) && item.kind !== 'prepay';
  const heroResult = buildHero(plan.items, engineCards, finishById, today, isUnknown);
  const comingUp = plan.items
    .filter((item) => !heroResult?.heroItems.has(item))
    .slice(0, 2)
    .map((item): DateBlockItem => {
      const card = engineCards.find((c) => c.id === item.cardId);
      const unknown = isUnknown(item);
      return {
        ...(unknown ? { day: '—', date: '?', month: '—' } : dateParts(item.payBy)),
        title: card?.name ?? item.cardId,
        reason: reasonLine(item, unknown),
        amount: formatINR(item.amount),
      };
    });

  let score: ScoreModel | null = null;
  if (hasCards) {
    const current = estimate(input, overallPct ?? 0, plan.highestCardBefore ?? 0, counted.length);
    const afterPlan =
      plan.items.length > 0
        ? estimate(
            input,
            plan.overallUtilizationAfter ?? 0,
            plan.highestCardAfter ?? 0,
            counted.length,
          )
        : null;
    score = {
      range: formatScoreRange(current.low, current.high),
      band: current.band,
      withPlanRange: afterPlan ? formatScoreRange(afterPlan.low, afterPlan.high) : null,
      barPercent: scalePercent(current.low, current.high),
      targetPercent: afterPlan
        ? scalePercent(afterPlan.low, afterPlan.high)
        : scalePercent(current.low, current.high),
    };
  }

  const planCardIds = new Set(plan.items.map((item) => item.cardId));
  const paidOffIds = new Set(
    payments.map((p) => p.cardId).filter((cardId) => !planCardIds.has(cardId)),
  );

  const overallAfter = plan.items.length > 0 ? plan.overallUtilizationAfter : null;
  const utilTile = {
    value: overallPct === null ? '—' : formatPercent(overallPct),
    over: overallPct !== null && overallPct > rules.thresholdPct,
    caption:
      overallPct === null
        ? 'No card with a limit yet'
        : `${formatINR(counted.reduce((s, c) => s + c.outstanding, 0))} of ${formatINR(counted.reduce((s, c) => s + c.limit, 0))} · target ${rules.thresholdPct}%`,
    delta:
      overallPct !== null && overallAfter !== null && overallAfter < overallPct
        ? `↓ ${formatPercent(overallAfter)} after plan`
        : undefined,
  };

  let nothingToDo: string | null = null;
  if (plan.items.length === 0) nothingToDo = hasCards ? NOTHING_TO_PAY_TEXT : NO_CARDS_TEXT;

  return {
    firstName: profile.firstName,
    initials: initialsOf(profile.name),
    isSample: profile.isSample,
    threshold: rules.thresholdPct,
    overall:
      overallPct === null
        ? null
        : {
            pct: overallPct,
            outstanding: counted.reduce((sum, c) => sum + c.outstanding, 0),
            limit: counted.reduce((sum, c) => sum + c.limit, 0),
          },
    overallAfter,
    utilTile,
    cards: counted.map((c) => ({
      id: c.id,
      name: c.name,
      finish: finishById.get(c.id) ?? 'graphite',
      utilPercent: utilization(c.outstanding, c.limit) ?? 0,
      line: cardLine(c, demoById.get(c.id), today),
    })),
    excluded,
    hero: heroResult?.hero ?? null,
    comingUp,
    stepsTotal: planCardIds.size + paidOffIds.size,
    stepsDone: paidOffIds.size,
    planItemCount: plan.items.length,
    score,
    hasCards,
    nothingToDo,
  };
}
