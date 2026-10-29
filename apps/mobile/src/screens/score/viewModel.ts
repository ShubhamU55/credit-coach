import {
  DEFAULT_PREDICTOR_CONFIG,
  formatBeforeAfter,
  formatINR,
  formatPercent,
  formatScoreRange,
  planPayments,
  type CardPayment,
  type GuardResult,
  type ScoreReason,
  type WhatIfOutcome,
  type WhatIfScenario,
} from '@credit-coach/engine';

import type { DemoCard, DemoRules, IsoDate } from '../../demo/types';
import { toPlannerCards, toPlannerRules } from './adapter';

const SCORE_MAX = 900;
/** An after-range whose centre sits within this many points of the before-range "barely moves". */
const BARELY_MOVES_POINTS = 2;
const MONTHS_PER_YEAR = 12;

export type TileKey = WhatIfScenario['kind'];

export interface WhatIfTileSpec {
  key: TileKey;
  label: string;
  suggested: boolean;
  /** Decorative glyph (no icon dependency in the app). */
  glyph: string;
}

/** The six tiles, in the order of docs/design.md 7.5. */
export const WHAT_IF_TILES: readonly WhatIfTileSpec[] = [
  { key: 'follow-plan', label: 'Follow this month’s plan', suggested: true, glyph: '✓' },
  { key: 'pay-card', label: 'Pay an amount on a card', suggested: false, glyph: '₹' },
  { key: 'miss-payment', label: 'Miss a payment', suggested: false, glyph: '!' },
  { key: 'close-card', label: 'Close a card', suggested: false, glyph: '×' },
  { key: 'apply', label: 'Apply for a card or loan', suggested: false, glyph: '+' },
  { key: 'fd-card', label: 'Open an FD-backed card', suggested: false, glyph: '₹' },
];

export interface ZoneSpec {
  name: string;
  from: number;
  to: number;
}

/** Zone bar segments from the engine config (admin-editable), never hard-coded in the UI. */
export function zoneSpecs(): ZoneSpec[] {
  const zones = DEFAULT_PREDICTOR_CONFIG.zones;
  return zones.map((zone, i) => {
    const next = zones[i + 1];
    return { name: zone.label, from: zone.min, to: next ? next.min - 1 : SCORE_MAX };
  });
}

export interface ReasonRowData {
  key: string;
  title: string;
  direction: 'lowers' | 'improves';
}

function yearsAndMonths(months: number): string {
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const rest = months % MONTHS_PER_YEAR;
  return `${years} yrs ${rest} mo`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** A factor's value in its own units, for the before and after text of a what-if. */
function valueText(reason: ScoreReason, which: 'current' | 'previous'): string {
  const values = reason[which];
  if (values === undefined) return '';
  switch (reason.factor) {
    case 'paymentHistory':
      return `${(values as typeof reason.current).missedPayments} missed`;
    case 'overallUtilization':
    case 'maxCardUtilization':
      return formatPercent((values as typeof reason.current).pct);
    case 'hardInquiries':
      return `${(values as typeof reason.current).last6m} in 6 months`;
    case 'creditAge':
      return yearsAndMonths((values as typeof reason.current).oldestAccountMonths);
    case 'openAccounts':
      return `${(values as typeof reason.current).count} open`;
    case 'creditMix': {
      const v = values as typeof reason.current;
      return `${v.secured} secured, ${v.unsecured} unsecured`;
    }
  }
}

const FACTOR_LABEL: Record<ScoreReason['factor'], string> = {
  paymentHistory: 'Payment history',
  overallUtilization: 'Overall utilization',
  maxCardUtilization: 'Highest card',
  hardInquiries: 'Hard inquiries',
  creditAge: 'Oldest account',
  openAccounts: 'Open accounts',
  creditMix: 'Credit mix',
};

/** A reason title for the current state, for example "Highest card at 81.0%". */
function currentTitle(reason: ScoreReason): string {
  switch (reason.factor) {
    case 'paymentHistory': {
      const { onTimePayments, missedPayments } = reason.current;
      return missedPayments > 0
        ? `${missedPayments} missed ${plural(missedPayments, 'payment', 'payments')}`
        : `${onTimePayments} months with zero missed`;
    }
    case 'overallUtilization':
      return `Overall utilization ${formatPercent(reason.current.pct)}`;
    case 'maxCardUtilization':
      return `Highest card at ${formatPercent(reason.current.pct)}`;
    case 'hardInquiries': {
      const n = reason.current.last6m;
      return `${n} hard ${plural(n, 'inquiry', 'inquiries')} in 6 months`;
    }
    case 'creditAge':
      return `Oldest account ${yearsAndMonths(reason.current.oldestAccountMonths)}`;
    case 'openAccounts':
      return `${reason.current.count} open ${plural(reason.current.count, 'account', 'accounts')}`;
    case 'creditMix':
      return `Credit mix: ${valueText(reason, 'current')}`;
  }
}

function reasonTitle(reason: ScoreReason): string {
  if (reason.previous === undefined) return currentTitle(reason);
  const change = formatBeforeAfter(valueText(reason, 'previous'), valueText(reason, 'current'));
  return `${FACTOR_LABEL[reason.factor]} ${change}`;
}

/**
 * Reason rows for the kit. A factor that does not move the score has no direction to word, so
 * it is left out (the kit row only says "lowers" or "improves").
 */
export function reasonRows(reasons: readonly ScoreReason[]): ReasonRowData[] {
  return reasons.flatMap((reason): ReasonRowData[] => {
    if (reason.direction === 'flat') return [];
    return [
      {
        key: reason.factor,
        title: reasonTitle(reason),
        direction: reason.direction === 'up' ? 'improves' : 'lowers',
      },
    ];
  });
}

export interface ScenarioInput {
  cardId?: string;
  amount?: number;
}

export interface PlanContext {
  cards: readonly DemoCard[];
  rules: DemoRules;
  today: IsoDate;
  cash: number;
}

/** What "follow this month's plan" pays: the planner's steps, added up per card. */
export function followPlanPayments({ cards, rules, today, cash }: PlanContext): CardPayment[] {
  const plan = planPayments({
    cards: toPlannerCards(cards),
    cash,
    today,
    rules: toPlannerRules(rules),
  });
  const totals = new Map<string, number>();
  for (const item of plan.items) {
    totals.set(item.cardId, (totals.get(item.cardId) ?? 0) + item.amount);
  }
  return Array.from(totals, ([cardId, amount]) => ({ cardId, amount })).filter(
    (payment) => payment.amount > 0,
  );
}

const isWholeRupees = (n: number | undefined): n is number =>
  n !== undefined && Number.isSafeInteger(n) && n > 0;

function payCard({ cardId, amount }: ScenarioInput): WhatIfScenario | null {
  return cardId !== undefined && isWholeRupees(amount)
    ? { kind: 'pay-card', cardId, amount }
    : null;
}

function fdCard({ amount }: ScenarioInput): WhatIfScenario | null {
  return isWholeRupees(amount) ? { kind: 'fd-card', fdAmount: amount } : null;
}

/** The engine scenario for a tile and the user's choices, or null while the choices are incomplete. */
export function buildScenario(
  key: TileKey,
  input: ScenarioInput,
  plan: PlanContext,
): WhatIfScenario | null {
  switch (key) {
    case 'follow-plan':
      return { kind: 'follow-plan', payments: followPlanPayments(plan) };
    case 'pay-card':
      return payCard(input);
    case 'miss-payment':
      return { kind: 'miss-payment' };
    case 'close-card':
      return input.cardId === undefined ? null : { kind: 'close-card', cardId: input.cardId };
    case 'apply':
      return { kind: 'apply', product: 'card' };
    case 'fd-card':
      return fdCard(input);
  }
}

export type ResultDirection = 'lowers' | 'improves' | 'barely moves';

export interface GuardView {
  warn: boolean;
  headline: string;
  impactLine: string;
}

export interface OutcomeView {
  beforeRange: string;
  afterRange: string;
  direction: ResultDirection;
  variant: 'standard' | 'closeCard';
  reasons: ReasonRowData[];
  utilizationLines: { overall: string; highest: string };
  limitLine: string | null;
  oldestAccountLine: string | null;
  guard: GuardView | null;
}

function directionOf(outcome: WhatIfOutcome): ResultDirection {
  const centre = (e: { low: number; high: number }) => (e.low + e.high) / 2;
  const move = centre(outcome.after) - centre(outcome.before);
  if (move > BARELY_MOVES_POINTS) return 'improves';
  return move < -BARELY_MOVES_POINTS ? 'lowers' : 'barely moves';
}

/** The guard text. The impact is a range of points lost, never a predicted score. */
export function describeGuard(guard: GuardResult): GuardView {
  const { hardInquiries6m, impact } = guard;
  const count = `${hardInquiries6m} hard ${plural(hardInquiries6m, 'inquiry', 'inquiries')}`;
  return {
    warn: guard.shouldWarn,
    headline: guard.shouldWarn
      ? `You already have ${count} in the last 6 months.`
      : `You have ${count} in the last 6 months.`,
    impactLine: `Another application could cost about ${impact.pointsLow}–${impact.pointsHigh} points.`,
  };
}

/** Turns the engine's what-if outcome into display strings. Every figure comes from the engine. */
export function describeOutcome(outcome: WhatIfOutcome): OutcomeView {
  const { utilization, warnings } = outcome;
  const limit = warnings.find((w) => w.kind === 'limit-loss');
  const age = warnings.find((w) => w.kind === 'credit-age');
  const oldestLine =
    age?.kind === 'credit-age' && age.isOldestAccount
      ? `This is your oldest account. Your oldest account goes from ${yearsAndMonths(age.oldestAccountMonthsBefore)} to ${yearsAndMonths(age.oldestAccountMonthsAfter)}.`
      : null;
  const pct = (before: number, after: number) =>
    formatBeforeAfter(formatPercent(before), formatPercent(after));
  return {
    beforeRange: formatScoreRange(outcome.before.low, outcome.before.high),
    afterRange: formatScoreRange(outcome.after.low, outcome.after.high),
    direction: directionOf(outcome),
    variant: outcome.scenario === 'close-card' ? 'closeCard' : 'standard',
    reasons: reasonRows(outcome.reasons),
    utilizationLines: {
      overall: `Overall utilization ${pct(utilization.overallBefore, utilization.overallAfter)}`,
      highest: `Highest card ${pct(utilization.maxCardBefore, utilization.maxCardAfter)}`,
    },
    limitLine:
      limit?.kind === 'limit-loss'
        ? `You lose ${formatINR(limit.limitLost)} of limit. Total limit ${formatBeforeAfter(formatINR(limit.totalLimitBefore), formatINR(limit.totalLimitAfter))}.`
        : null,
    oldestAccountLine: oldestLine,
    guard: outcome.guard ? describeGuard(outcome.guard) : null,
  };
}

export interface Headline {
  before: string;
  zone: string;
  after: string;
}

/** "You're in *good* shape — and the plan helps." The zone word is the italic one. */
export function scoreHeadline(zone: string, planHelps: boolean): Headline {
  return {
    before: 'You’re in ',
    zone: zone.toLowerCase(),
    after: planHelps ? ' shape — and the plan helps.' : ' shape.',
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDayNumber(iso: IsoDate): number {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  // Date.UTC with explicit arguments is deterministic; it never reads the clock.
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (both ISO dates). */
export function daysSince(from: IsoDate, to: IsoDate): number {
  return isoDayNumber(to) - isoDayNumber(from);
}

/** The tail of the overline "YOUR SCORE · CHECKED 19 DAYS AGO". */
export function checkedAgo(days: number): string {
  if (days <= 0) return 'CHECKED TODAY';
  return `CHECKED ${days} ${plural(days, 'DAY', 'DAYS')} AGO`;
}

/** The h1 of a what-if result, after "If ": the action, with the card name and amount. */
export function scenarioTitle(scenario: WhatIfScenario, cards: readonly DemoCard[]): string {
  const nameOf = (id: string) => cards.find((card) => card.id === id)?.name ?? 'this card';
  switch (scenario.kind) {
    case 'follow-plan':
      return 'you follow this month’s plan';
    case 'pay-card':
      return `you pay ${formatINR(scenario.amount)} on ${nameOf(scenario.cardId)}`;
    case 'miss-payment':
      return 'you miss a payment';
    case 'close-card':
      return `you close ${nameOf(scenario.cardId)}`;
    case 'apply':
      return 'you apply for a card or loan';
    case 'fd-card':
      return `you open an FD-backed card with ${formatINR(scenario.fdAmount)}`;
  }
}
