import { checkApplicationGuard, withOneMoreInquiry, DEFAULT_GUARD_CONFIG } from './guard';
import type { GuardConfig, GuardResult } from './guard';
import { compareReasons, predictScore } from './predictor';
import type { PredictorInput, ScoreEstimate, ScoreReason } from './predictor';
import { DEFAULT_PREDICTOR_CONFIG, type PredictorConfig } from './predictor-config';
import { overallUtilization, utilization } from './utilization';

/** A card as the what-ifs see it: integer rupees and the account's age. */
export interface WhatIfCard {
  id: string;
  limit: number;
  outstanding: number;
  ageMonths: number;
  isSecured: boolean;
}

/**
 * The current state. `input`'s utilization and account counts must describe `cards`
 * (e.g. computed with `overallUtilization`/`utilization`), so before and after compare like for like.
 */
export interface WhatIfContext {
  input: PredictorInput;
  cards: ReadonlyArray<WhatIfCard>;
}

export interface CardPayment {
  cardId: string;
  amount: number;
}

/** The six PRD §5.5 scenarios. */
export type WhatIfScenario =
  | { kind: 'pay-card'; cardId: string; amount: number }
  | { kind: 'follow-plan'; payments: ReadonlyArray<CardPayment> }
  | { kind: 'miss-payment'; cardId?: string }
  | { kind: 'close-card'; cardId: string }
  | { kind: 'apply'; product: 'card' | 'loan' }
  | { kind: 'fd-card'; fdAmount: number };

/** Closing a card always carries both (non-negotiable 4); `isOldestAccount` marks the worst case. */
export type WhatIfWarning =
  | { kind: 'limit-loss'; limitLost: number; totalLimitBefore: number; totalLimitAfter: number }
  | {
      kind: 'credit-age';
      isOldestAccount: boolean;
      oldestAccountMonthsBefore: number;
      oldestAccountMonthsAfter: number;
    };

export interface WhatIfOutcome {
  ok: true;
  scenario: WhatIfScenario['kind'];
  before: ScoreEstimate;
  after: ScoreEstimate;
  /** What moved, with `previous` and `current` numbers. At most 3. */
  reasons: ScoreReason[];
  utilization: {
    overallBefore: number;
    overallAfter: number;
    maxCardBefore: number;
    maxCardAfter: number;
  };
  totalLimit: { before: number; after: number };
  warnings: WhatIfWarning[];
  /** Set for scenarios that are an application (new card, loan or FD-backed card). */
  guard?: GuardResult;
}

export interface WhatIfError {
  ok: false;
  /** `duplicate-card-id`: two cards share an id, so a scenario can't tell them apart. */
  error: 'unknown-card' | 'invalid-amount' | 'duplicate-card-id';
}

export type WhatIfResult = WhatIfOutcome | WhatIfError;

export interface WhatIfConfig {
  predictor: PredictorConfig;
  guard: GuardConfig;
  /** FD-backed card limit as a share of the FD (issuers typically offer 75–90%). */
  fdLimitRatio: number;
  /** Most issuers still pull a bureau report for an FD-backed card. */
  fdCardAddsHardInquiry: boolean;
}

export const DEFAULT_WHATIF_CONFIG: WhatIfConfig = {
  predictor: DEFAULT_PREDICTOR_CONFIG,
  guard: DEFAULT_GUARD_CONFIG,
  fdLimitRatio: 0.9,
  fdCardAddsHardInquiry: true,
};

/** A scenario applied to the state, before scoring. */
interface Applied {
  input: PredictorInput;
  totalLimitAfter: number;
  warnings: WhatIfWarning[];
  isApplication: boolean;
}

const UNKNOWN_CARD: WhatIfError = { ok: false, error: 'unknown-card' };
const INVALID_AMOUNT: WhatIfError = { ok: false, error: 'invalid-amount' };
const DUPLICATE_CARD_ID: WhatIfError = { ok: false, error: 'duplicate-card-id' };

const hasDuplicateIds = (cards: ReadonlyArray<WhatIfCard>): boolean =>
  new Set(cards.map((c) => c.id)).size !== cards.length;

const isRupeeAmount = (n: number): boolean => Number.isSafeInteger(n) && n > 0;

const totalLimit = (cards: ReadonlyArray<WhatIfCard>): number =>
  cards.reduce((sum, c) => (Number.isFinite(c.limit) && c.limit > 0 ? sum + c.limit : sum), 0);

const maxCardUtilization = (cards: ReadonlyArray<WhatIfCard>): number | null => {
  const utils = cards
    .map((c) => utilization(c.outstanding, c.limit))
    .filter((u): u is number => u !== null);
  return utils.length === 0 ? null : Math.max(...utils);
};

const unchanged = (context: WhatIfContext, input: PredictorInput): Applied => ({
  input,
  totalLimitAfter: totalLimit(context.cards),
  warnings: [],
  isApplication: false,
});

/** Pays each amount (capped at the card's outstanding). Paying can only lower utilization. */
const applyPayments = (
  context: WhatIfContext,
  payments: ReadonlyArray<CardPayment>,
): Applied | WhatIfError => {
  const balances = new Map(context.cards.map((c) => [c.id, c.outstanding]));
  for (const { cardId, amount } of payments) {
    const balance = balances.get(cardId);
    if (balance === undefined) return UNKNOWN_CARD;
    if (!isRupeeAmount(amount)) return INVALID_AMOUNT;
    balances.set(cardId, Math.max(Math.min(balance, 0), balance - amount));
  }
  const paid = context.cards.map((c) => ({
    ...c,
    outstanding: balances.get(c.id) ?? c.outstanding,
  }));
  const { input } = context;
  return unchanged(context, {
    ...input,
    overallUtilizationPct: Math.min(
      input.overallUtilizationPct,
      overallUtilization(paid) ?? input.overallUtilizationPct,
    ),
    maxCardUtilizationPct: Math.min(
      input.maxCardUtilizationPct,
      maxCardUtilization(paid) ?? input.maxCardUtilizationPct,
    ),
  });
};

/**
 * Closes a card. Its balance is still owed, so total outstanding stays while the limit goes:
 * utilization rises. Max-card utilization never improves (the balance doesn't vanish).
 */
const closeCard = (context: WhatIfContext, cardId: string): Applied | WhatIfError => {
  const card = context.cards.find((c) => c.id === cardId);
  if (card === undefined) return UNKNOWN_CARD;
  const { input } = context;
  const remaining = context.cards.filter((c) => c.id !== cardId);
  const before = totalLimit(context.cards);
  const after = totalLimit(remaining);
  const outstanding = context.cards.reduce((sum, c) => sum + c.outstanding, 0);
  const raised = utilization(outstanding, after) ?? (outstanding > 0 ? 100 : 0);
  const isOldestAccount = card.ageMonths >= input.oldestAccountMonths;
  const nextOldest = Math.max(0, ...remaining.map((c) => c.ageMonths));
  const oldestAfter = isOldestAccount
    ? Math.min(input.oldestAccountMonths, nextOldest)
    : input.oldestAccountMonths;
  const secured = card.isSecured ? 1 : 0;
  return {
    input: {
      ...input,
      overallUtilizationPct: Math.max(input.overallUtilizationPct, raised),
      oldestAccountMonths: oldestAfter,
      openAccounts: Math.max(0, input.openAccounts - 1),
      securedAccounts: Math.max(0, input.securedAccounts - secured),
      unsecuredAccounts: Math.max(0, input.unsecuredAccounts - (1 - secured)),
    },
    totalLimitAfter: after,
    warnings: [
      {
        kind: 'limit-loss',
        limitLost: before - after,
        totalLimitBefore: before,
        totalLimitAfter: after,
      },
      {
        kind: 'credit-age',
        isOldestAccount,
        oldestAccountMonthsBefore: input.oldestAccountMonths,
        oldestAccountMonthsAfter: oldestAfter,
      },
    ],
    isApplication: false,
  };
};

/** A new FD-backed card: a secured limit at 0% use, plus (by default) a hard inquiry. */
const openFdCard = (
  context: WhatIfContext,
  fdAmount: number,
  config: WhatIfConfig,
): Applied | WhatIfError => {
  if (!isRupeeAmount(fdAmount)) return INVALID_AMOUNT;
  const newCard: WhatIfCard = {
    id: 'fd-backed-card',
    limit: Math.floor(fdAmount * config.fdLimitRatio),
    outstanding: 0,
    ageMonths: 0,
    isSecured: true,
  };
  const cards = [...context.cards, newCard];
  const base = config.fdCardAddsHardInquiry ? withOneMoreInquiry(context.input) : context.input;
  const lowered = overallUtilization(cards) ?? base.overallUtilizationPct;
  return {
    input: {
      ...base,
      overallUtilizationPct: Math.min(base.overallUtilizationPct, lowered),
      openAccounts: Math.max(0, base.openAccounts) + 1,
      securedAccounts: Math.max(0, base.securedAccounts) + 1,
    },
    totalLimitAfter: totalLimit(cards),
    warnings: [],
    isApplication: true,
  };
};

const applyScenario = (
  context: WhatIfContext,
  scenario: WhatIfScenario,
  config: WhatIfConfig,
): Applied | WhatIfError => {
  switch (scenario.kind) {
    case 'pay-card':
      return applyPayments(context, [{ cardId: scenario.cardId, amount: scenario.amount }]);
    case 'follow-plan':
      return applyPayments(context, scenario.payments);
    case 'miss-payment':
      if (scenario.cardId !== undefined && !context.cards.some((c) => c.id === scenario.cardId)) {
        return UNKNOWN_CARD;
      }
      return unchanged(context, {
        ...context.input,
        missedPayments: Math.max(0, context.input.missedPayments) + 1,
      });
    case 'close-card':
      return closeCard(context, scenario.cardId);
    case 'apply':
      // An application is modelled as its hard inquiry only: approval and the new limit are unknown.
      return { ...unchanged(context, withOneMoreInquiry(context.input)), isApplication: true };
    case 'fd-card':
      return openFdCard(context, scenario.fdAmount, config);
  }
};

/**
 * Runs one what-if scenario (PRD §5.5) and returns the estimate before and after, the reasons
 * that moved, the utilization change and any warnings. Applications also carry the guard (§5.6).
 * Expected domain problems (an unknown card, an invalid amount, two cards sharing an id) come back
 * as `{ ok: false }`.
 * @throws {RangeError} on input that `predictScore` rejects (malformed dates, non-finite numbers).
 */
export function runWhatIf(
  context: WhatIfContext,
  scenario: WhatIfScenario,
  config: WhatIfConfig = DEFAULT_WHATIF_CONFIG,
): WhatIfResult {
  if (hasDuplicateIds(context.cards)) return DUPLICATE_CARD_ID;
  const applied = applyScenario(context, scenario, config);
  if ('ok' in applied) return applied;
  const { input } = context;
  const after = applied.input;
  const outcome: WhatIfOutcome = {
    ok: true,
    scenario: scenario.kind,
    before: predictScore(input, config.predictor),
    after: predictScore(after, config.predictor),
    reasons: compareReasons(input, after, config.predictor),
    utilization: {
      overallBefore: input.overallUtilizationPct,
      overallAfter: after.overallUtilizationPct,
      maxCardBefore: input.maxCardUtilizationPct,
      maxCardAfter: after.maxCardUtilizationPct,
    },
    totalLimit: { before: totalLimit(context.cards), after: applied.totalLimitAfter },
    warnings: applied.warnings,
  };
  if (applied.isApplication) {
    outcome.guard = checkApplicationGuard(input, config.guard, config.predictor);
  }
  return outcome;
}
