import { readFileSync } from 'node:fs';
import {
  buildExplainPayload,
  DEFAULT_COACH_RULES,
  planPayments,
  type Card,
  type CoachRules,
  type ExplainPayload,
  type Plan,
} from '@credit-coach/engine';

/** The migration that defines the three personas; the tests read the data from it, not a copy. */
const DEMO_MIGRATION = new URL('../../../migrations/20261028100200_demo_data.sql', import.meta.url);

export const TODAY = '2026-10-21';

export interface PersonaRow {
  slug: string;
  persona: string;
  display_name: string;
  pan_masked: string;
  mobile_masked: string;
  score: number;
  score_date: string;
  cash: number;
  history_months: number;
  missed_payments: number;
  oldest_account_months: number;
  hard_inquiries_6m: number;
  is_default: boolean;
  sort_order: number;
  report: { cards: (Card & { secured: boolean })[]; loans: unknown[] };
}

/** Reads the $json$ ... $json$ block of default_sample_profiles() from the migration. */
export function loadPersonas(): PersonaRow[] {
  const sql = readFileSync(DEMO_MIGRATION, 'utf8');
  const match = /\$json\$([\s\S]*?)\$json\$/.exec(sql);
  if (!match?.[1]) throw new Error('personas JSON block not found in the demo_data migration');
  return JSON.parse(match[1]) as PersonaRow[];
}

export function persona(slug: string): PersonaRow {
  const found = loadPersonas().find((p) => p.slug === slug);
  if (!found) throw new Error(`no persona ${slug}`);
  return found;
}

/** The persona's cards in the engine's Card shape (the extra `secured` flag is dropped). */
export function cardsOf(row: PersonaRow): Card[] {
  return row.report.cards.map((c) => ({
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    limit: c.limit,
    outstanding: c.outstanding,
    lastStatementBalance: c.lastStatementBalance,
    statementDay: c.statementDay,
    dueDay: c.dueDay,
    minimumDue: c.minimumDue,
    paidSinceStatement: c.paidSinceStatement,
  }));
}

export interface Scenario {
  plan: Plan;
  cards: Card[];
  payload: ExplainPayload;
}

/** Plans a persona with the engine and builds the exact payload the app would send. */
export function scenario(
  slug: string,
  options: {
    cash?: number;
    rules?: Partial<CoachRules>;
    /** Changes the persona's cards before planning (e.g. a card with no limit). */
    editCards?: (cards: Card[]) => Card[];
  } = {},
): Scenario {
  const row = persona(slug);
  const cards = options.editCards ? options.editCards(cardsOf(row)) : cardsOf(row);
  const rules: CoachRules = { ...DEFAULT_COACH_RULES, ...options.rules };
  const plan = planPayments({ cards, cash: options.cash ?? row.cash, today: TODAY, rules });
  const payload = buildExplainPayload(plan, cards, {
    today: TODAY,
    rules: { thresholdPct: rules.thresholdPct, aimFor10: rules.aimFor10 },
  });
  return { plan, cards, payload };
}
