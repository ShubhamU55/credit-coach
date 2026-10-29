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
  type Plan,
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
  /** The bold date in the sentence, for example `Thu, 22 Oct`. */
  dateText: string;
  /** The sentence between the bold date and the bold ending, starting with " — ". */
  middleText: string;
  /** The bold ending, for example `zero interest.`; empty when there is none. */
  emphasisText: string;
  amount: string;
  clearsStatement: boolean;
  minimumLine: string;
}

export interface HomeModel {
  firstName: string;
  initials: string;
  isSample: boolean;
  threshold: number;
  overall: { pct: number; outstanding: number; limit: number } | null;
  overallAfter: number | null;
  cards: CardTileModel[];
  /** Cards with a zero or missing limit: left out of utilization and flagged (PRD 5.2). */
  excluded: { id: string; name: string }[];
  hero: HeroModel | null;
  comingUp: DateBlockItem[];
  stepsTotal: number;
  stepsDone: number;
  score: {
    range: string;
    band: string;
    withPlanRange: string | null;
    /** Where the range sits on the 300-900 scale, in percent (for the tile bar and tick). */
    barPercent: number;
    targetPercent: number;
  };
  /** The planner's note when there is nothing left to pay. */
  nothingToDo: string | null;
}

const KIND_LABEL: Record<PlanItemKind, string> = {
  overdue_minimum: 'Pay the overdue minimum',
  minimum: 'Pay the minimum',
  statement: 'Clear the statement',
  prepay: "Lower before it's reported",
};

/** The first letters of the first two words of the name; a trailing "(sample)" tag is ignored. */
export function initialsOf(name: string): string {
  return name
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
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
    // The engine needs a day; a card with nothing due this cycle never uses it.
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
function dateParts(iso: IsoDate): { day: string; date: string; month: string } {
  const [day, date, month] = formatShortDate(iso).split(/[, ]+/);
  return { day, date, month };
}

const dayAndMonth = (iso: IsoDate): string => {
  const { date, month } = dateParts(iso);
  return `${date} ${month}`;
};

function reasonLine(item: PlanItem): string {
  const label = KIND_LABEL[item.kind];
  if (item.utilizationBefore === null || item.utilizationAfter === null) return label;
  const change = formatBeforeAfter(
    formatPercent(item.utilizationBefore),
    formatPercent(item.utilizationAfter),
  );
  return `${label} · ${change}`;
}

function buildHero(
  plan: Plan,
  engineCards: readonly Card[],
  finishById: ReadonlyMap<string, CardFinish>,
  today: IsoDate,
): { hero: HeroModel; heroItems: Set<PlanItem> } | null {
  // The hero is the earliest pay-by date; ties keep the planner's order.
  const first = [...plan.items].sort((a, b) => a.payBy.localeCompare(b.payBy))[0];
  if (!first) return null;
  const card = engineCards.find((c) => c.id === first.cardId);
  if (!card) return null;
  const cycle = cardCycle(card, today);
  // One card's minimum and statement steps are one payment from the user's side.
  const heroItems = new Set(
    plan.items.filter((item) => item.cardId === first.cardId && item.kind !== 'prepay'),
  );
  if (heroItems.size === 0) heroItems.add(first);
  const planned = [...heroItems].reduce((sum, item) => sum + item.amount, 0);
  const clearsStatement = cycle.remainingStatement > 0 && planned >= cycle.remainingStatement;
  const amount = clearsStatement ? cycle.remainingStatement : planned;
  const dateText = formatShortDate(first.payBy);
  const middleText = clearsStatement
    ? ' — clears your full statement, so '
    : ` — ${first.reason.text}`;
  const minimumLine =
    cycle.remainingMinimum > 0 && first.kind !== 'prepay'
      ? `${formatINR(Math.min(cycle.remainingMinimum, amount))} of it is your minimum.`
      : 'No minimum is due on this payment.';
  return {
    heroItems,
    hero: {
      cardId: card.id,
      cardName: card.name,
      finish: finishById.get(card.id) ?? 'graphite',
      dueChip: `BY ${dateText.toUpperCase()}`,
      dateText,
      middleText,
      emphasisText: clearsStatement ? 'zero interest.' : '',
      amount: formatINR(amount),
      clearsStatement,
      minimumLine,
    },
  };
}

function cardLine(card: Card, today: IsoDate): string {
  const cycle = cardCycle(card, today);
  const due = cycle.dueDate === null ? 'nothing due' : `due ${dayAndMonth(cycle.dueDate)}`;
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

export function buildHomeModel(input: HomeModelInput): HomeModel {
  const { profile, rules, payments, today } = input;
  const engineCards = toEngineCards(input.cards);
  const engineRules = toEngineRules(rules);
  const plan = planPayments({
    cards: engineCards,
    cash: profile.cashForCards,
    today,
    rules: engineRules,
  });

  const finishById = new Map(engineCards.map((c, i) => [c.id, finishForIndex(i)] as const));
  const counted = engineCards.filter((c) => validLimit(c.limit));
  const excluded = engineCards
    .filter((c) => !validLimit(c.limit))
    .map((c) => ({ id: c.id, name: c.name }));

  const overallPct = overallUtilization(counted);
  const heroResult = buildHero(plan, engineCards, finishById, today);
  const comingUp = plan.items
    .filter((item) => !heroResult?.heroItems.has(item))
    .slice(0, 2)
    .map((item): DateBlockItem => {
      const card = engineCards.find((c) => c.id === item.cardId);
      return {
        ...dateParts(item.payBy),
        title: card?.name ?? item.cardId,
        reason: reasonLine(item),
        amount: formatINR(item.amount),
      };
    });

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

  const stepsDone = payments.length;
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
    overallAfter: plan.items.length > 0 ? plan.overallUtilizationAfter : null,
    cards: counted.map((c) => ({
      id: c.id,
      name: c.name,
      finish: finishById.get(c.id) ?? 'graphite',
      utilPercent: utilization(c.outstanding, c.limit) ?? 0,
      line: cardLine(c, today),
    })),
    excluded,
    hero: heroResult?.hero ?? null,
    comingUp,
    stepsTotal: plan.items.length + stepsDone,
    stepsDone,
    score: {
      range: formatScoreRange(current.low, current.high),
      band: current.band,
      withPlanRange: afterPlan ? formatScoreRange(afterPlan.low, afterPlan.high) : null,
      barPercent: scalePercent(current.low, current.high),
      targetPercent: afterPlan
        ? scalePercent(afterPlan.low, afterPlan.high)
        : scalePercent(current.low, current.high),
    },
    nothingToDo: plan.items.length === 0 ? (plan.leftoverReason?.text ?? plan.summary.text) : null,
  };
}

/** The midpoint of a score range as a percent of the 300-900 scale. */
function scalePercent(low: number, high: number): number {
  const percent = ((low + high) / 2 - 300) / 6;
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}
