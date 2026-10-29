import { formatINR, formatPercent, formatShortDate } from './format';
import type { CoachRules, IsoDate, Plan, PlanItemKind, ReasonCode, Rupees } from './types';

/** Just enough of a card to name it in words; plan items carry only the card id. */
export interface ExplainCard {
  id: string;
  name: string;
}

export interface ExplainContext {
  today: IsoDate;
  rules: Pick<CoachRules, 'thresholdPct' | 'aimFor10'>;
}

export interface ExplainPayloadItem {
  step: number;
  kind: PlanItemKind;
  card: string;
  amount: Rupees;
  payBy: IsoDate;
  reasonCode: ReasonCode;
  utilizationBefore: number | null;
  utilizationAfter: number | null;
}

export interface ExplainPayloadShortfall {
  card: string;
  kind: 'overdue_minimum' | 'minimum';
  required: Rupees;
  funded: Rupees;
  shortfall: Rupees;
  dueDate: IsoDate;
}

/**
 * The strict JSON the `explain` Edge Function receives. Every amount, date and percent is
 * already computed by the engine; the LLM only words them (CLAUDE.md non-negotiable 2).
 */
export interface ExplainPayload {
  version: 1;
  today: IsoDate;
  thresholdPct: number;
  aimFor10: boolean;
  summaryCode: ReasonCode;
  items: ExplainPayloadItem[];
  shortfalls: ExplainPayloadShortfall[];
  cashUsed: Rupees;
  leftover: Rupees;
  overallUtilizationBefore: number | null;
  overallUtilizationAfter: number | null;
  highestCardBefore: number | null;
  highestCardAfter: number | null;
  withinThreshold: boolean;
}

const nameOf = (cards: readonly ExplainCard[], id: string): string =>
  cards.find((c) => c.id === id)?.name ?? id;

/** Builds the numbers-only payload from a plan. Pure; "today" and rules are passed in. */
export function buildExplainPayload(
  plan: Plan,
  cards: readonly ExplainCard[],
  context: ExplainContext,
): ExplainPayload {
  const cashUsed = plan.items.reduce((sum, item) => sum + item.amount, 0);
  return {
    version: 1,
    today: context.today,
    thresholdPct: context.rules.thresholdPct,
    aimFor10: context.rules.aimFor10,
    summaryCode: plan.summary.code,
    items: plan.items.map((item) => ({
      step: item.step,
      kind: item.kind,
      card: nameOf(cards, item.cardId),
      amount: item.amount,
      payBy: item.payBy,
      reasonCode: item.reason.code,
      utilizationBefore: item.utilizationBefore,
      utilizationAfter: item.utilizationAfter,
    })),
    shortfalls: plan.shortfalls.map((s) => ({
      card: nameOf(cards, s.cardId),
      kind: s.kind,
      required: s.required,
      funded: s.funded,
      shortfall: s.shortfall,
      dueDate: s.dueDate,
    })),
    cashUsed,
    leftover: plan.leftover,
    overallUtilizationBefore: plan.overallUtilizationBefore,
    overallUtilizationAfter: plan.overallUtilizationAfter,
    highestCardBefore: plan.highestCardBefore,
    highestCardAfter: plan.highestCardAfter,
    withinThreshold: plan.withinThreshold,
  };
}

const MINIMUM_KINDS: readonly PlanItemKind[] = ['overdue_minimum', 'minimum'];

function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function movement(label: string, before: number | null, after: number | null): string | null {
  if (before === null || after === null) return null;
  return `${label} goes from ${formatPercent(before)} to ${formatPercent(after)}.`;
}

/**
 * The deterministic "Why this plan?" text. It is the fallback whenever the AI explanation
 * is unavailable, and it is also the baseline the AI text must stay consistent with.
 * Plain words, no hype, no predicted score.
 */
export function buildTemplateExplanation(plan: Plan, cards: readonly ExplainCard[]): string {
  const sentences: string[] = [];
  const name = (id: string) => nameOf(cards, id);
  const pay = (item: Plan['items'][number]) =>
    `${formatINR(item.amount)} on ${name(item.cardId)} by ${formatShortDate(item.payBy)}`;

  const minimums = plan.items.filter((i) => MINIMUM_KINDS.includes(i.kind));
  if (minimums.length > 0) {
    const lead = minimums.some((i) => i.kind === 'overdue_minimum')
      ? 'Overdue minimums come first'
      : 'Minimums come first';
    sentences.push(
      `${lead}: ${joinList(minimums.map((i) => pay(i)))}. A missed payment hurts your score the most.`,
    );
  }

  const statements = plan.items.filter((i) => i.kind === 'statement');
  if (statements.length > 0) {
    const allFull = statements.every((i) => i.reason.code === 'statement_full');
    const list = joinList(statements.map((i) => pay(i)));
    sentences.push(
      allFull
        ? `Then the full statement: ${list}. Paying it in full means no interest.`
        : `Then toward the statement: ${list}.`,
    );
  }

  const prepays = plan.items.filter((i) => i.kind === 'prepay');
  if (prepays.length > 0) {
    sentences.push(
      `Last, ${joinList(prepays.map((i) => pay(i)))} so a lower balance gets reported to the bureau.`,
    );
  }

  for (const s of plan.shortfalls) {
    const next =
      s.kind === 'overdue_minimum'
        ? 'Pay the rest now.'
        : `Pay the rest by ${formatShortDate(s.dueDate)}.`;
    sentences.push(
      `You are ${formatINR(s.shortfall)} short of the ${formatINR(s.required)} minimum on ${name(s.cardId)}. ${next}`,
    );
  }

  const overall = movement(
    'Overall utilization',
    plan.overallUtilizationBefore,
    plan.overallUtilizationAfter,
  );
  const highest = movement('Your highest card', plan.highestCardBefore, plan.highestCardAfter);
  if (overall || highest) {
    sentences.push([overall, highest].filter((s): s is string => s !== null).join(' '));
  }

  if (plan.leftover > 0) {
    sentences.push(
      `${formatINR(plan.leftover)} is left over, so nothing more is needed this cycle.`,
    );
  }

  return sentences.join(' ');
}
