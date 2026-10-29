import {
  DEFAULT_COACH_RULES,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_WHATIF_CONFIG,
  type GuardConfig,
  type WhatIfConfig,
  overallUtilization,
  utilization,
  type Card,
  type CoachRules,
  type PredictorInput,
  type WhatIfCard,
  type WhatIfContext,
} from '@credit-coach/engine';

import type { DemoCard, DemoProfile, DemoRules, IsoDate } from '../../demo/types';

/**
 * A card with nothing due this cycle has no `dueDay` in the demo data, but the engine's `Card`
 * needs one. The engine only reads it while a statement balance is still unpaid, so any valid
 * day works for a paid-in-full card.
 */
const NO_DUE_DAY = 28;

/** Highest single-card utilization in percent; cards without a limit are excluded (PRD 5.2). */
function maxCardUtilization(cards: readonly DemoCard[]): number {
  const values = cards
    .map((card) => utilization(card.outstanding, card.limit))
    .filter((value): value is number => value !== null);
  return values.length === 0 ? 0 : Math.max(...values);
}

/** The predictor's primitive inputs for the demo profile. Money stays integer rupees. */
export function toPredictorInput(
  profile: DemoProfile,
  cards: readonly DemoCard[],
  today: IsoDate,
): PredictorInput {
  const { history } = profile;
  return {
    today,
    anchor: { score: history.anchorScore, date: history.anchorDate },
    onTimePayments: history.monthsWithZeroMissed,
    missedPayments: history.missedPayments,
    overallUtilizationPct: overallUtilization(cards) ?? 0,
    maxCardUtilizationPct: maxCardUtilization(cards),
    hardInquiries6m: history.hardInquiries6m,
    hardInquiries12m: history.hardInquiries12m,
    oldestAccountMonths: history.oldestAccountMonths,
    openAccounts: cards.length,
    securedAccounts: history.securedAccounts,
    unsecuredAccounts: history.unsecuredAccounts,
  };
}

export function toWhatIfCards(cards: readonly DemoCard[]): WhatIfCard[] {
  return cards.map((card) => ({
    id: card.id,
    limit: card.limit,
    outstanding: card.outstanding,
    ageMonths: card.ageMonths,
    isSecured: card.isSecured,
  }));
}

export function toWhatIfContext(
  profile: DemoProfile,
  cards: readonly DemoCard[],
  today: IsoDate,
): WhatIfContext {
  return { input: toPredictorInput(profile, cards, today), cards: toWhatIfCards(cards) };
}

/** The planner's cards, for the "follow this month's plan" what-if. */
export function toPlannerCards(cards: readonly DemoCard[]): Card[] {
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    limit: card.limit,
    outstanding: card.outstanding,
    lastStatementBalance: card.lastStatementBalance,
    statementDay: card.statementDay,
    dueDay: card.dueDay ?? NO_DUE_DAY,
    minimumDue: card.minimumDue,
    paidSinceStatement: card.paidSinceStatement,
  }));
}

export function toPlannerRules(rules: DemoRules): CoachRules {
  return { ...DEFAULT_COACH_RULES, ...rules };
}

/** `DemoRules` plus the admin-set guard threshold N, once the seed carries it (PRD 5.6). */
export type RulesWithGuard = DemoRules & { minHardInquiries6m?: number };

/**
 * The guard config for the demo rules. `DemoRules` has no N yet, so the engine default applies
 * until it does; a valid whole number >= 1 on the rules wins (admin range 1-6).
 */
export function toGuardConfig(rules: RulesWithGuard): GuardConfig {
  const n = rules.minHardInquiries6m;
  return n !== undefined && Number.isInteger(n) && n >= 1
    ? { ...DEFAULT_GUARD_CONFIG, minHardInquiries6m: n }
    : DEFAULT_GUARD_CONFIG;
}

export function toWhatIfConfig(rules: RulesWithGuard): WhatIfConfig {
  return { ...DEFAULT_WHATIF_CONFIG, guard: toGuardConfig(rules) };
}
