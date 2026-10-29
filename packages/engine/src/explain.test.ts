import { describe, it, expect } from 'vitest';
import { buildExplainPayload, buildTemplateExplanation } from './explain';
import { planPayments } from './planner';
import { DEFAULT_COACH_RULES, type Card, type CoachRules, type PlanInput } from './types';

/** Aarav golden fixture (docs/design.md §8). Today = 21 Oct 2026, cash ₹1,20,000. */
const HDFC: Card = {
  id: 'hdfc-millennia',
  name: 'HDFC Millennia',
  issuer: 'HDFC Bank',
  limit: 100000,
  outstanding: 81000,
  lastStatementBalance: 74200,
  statementDay: 15,
  dueDay: 4,
  minimumDue: 3710,
  paidSinceStatement: 0,
};
const SBI: Card = {
  id: 'sbi-simplyclick',
  name: 'SBI SimplyClick',
  issuer: 'SBI Card',
  limit: 120000,
  outstanding: 38400,
  lastStatementBalance: 0,
  statementDay: 25,
  dueDay: 14,
  minimumDue: 0,
  paidSinceStatement: 0,
};
const AXIS: Card = {
  id: 'axis-neo',
  name: 'Axis Neo',
  issuer: 'Axis Bank',
  limit: 80000,
  outstanding: 15600,
  lastStatementBalance: 12400,
  statementDay: 2,
  dueDay: 22,
  minimumDue: 620,
  paidSinceStatement: 0,
};
const CARDS = [HDFC, SBI, AXIS];

const input = (over: Partial<PlanInput> = {}, rules: Partial<CoachRules> = {}): PlanInput => ({
  cards: CARDS,
  cash: 120000,
  today: '2026-10-21',
  rules: { ...DEFAULT_COACH_RULES, ...rules },
  ...over,
});

describe('buildTemplateExplanation', () => {
  it('explains the Aarav plan from the engine numbers only', () => {
    const plan = planPayments(input());

    const text = buildTemplateExplanation(plan, CARDS);

    expect(text).toContain('₹620');
    expect(text).toContain('Axis Neo');
    expect(text).toContain('Thu, 22 Oct');
    expect(text).toContain('₹3,710');
    expect(text).toContain('HDFC Millennia');
    expect(text).toContain('Wed, 4 Nov');
    expect(text).toContain('45.0% to 15.3%');
    expect(text).toContain('81.0% to 30.0%');
    expect(text).toContain('₹31,000 is left over');
    expect(text).toMatch(/minimum/i);
    expect(text).not.toMatch(/guarantee|boost/i);
  });

  it('explains the shortfall case and says what to do next', () => {
    const plan = planPayments(input({ cash: 500 }));

    const text = buildTemplateExplanation(plan, CARDS);

    expect(plan.shortfalls.length).toBeGreaterThan(0);
    expect(text).toContain('₹120 short of the ₹620 minimum on Axis Neo');
    expect(text).toContain('Thu, 22 Oct');
    expect(text).not.toContain('left over');
  });

  it('is deterministic for the same plan', () => {
    const plan = planPayments(input());

    expect(buildTemplateExplanation(plan, CARDS)).toBe(buildTemplateExplanation(plan, CARDS));
  });

  it('falls back to the card id when a name is unknown', () => {
    const plan = planPayments(input());

    expect(buildTemplateExplanation(plan, [])).toContain('axis-neo');
  });

  it('mentions lowering a card before it is reported when a prepay step exists', () => {
    const plan = planPayments(input({}, { aimFor10: true }));

    const text = buildTemplateExplanation(plan, CARDS);

    expect(text).toContain('SBI SimplyClick');
    expect(text).toMatch(/reported/);
  });
});

describe('buildExplainPayload', () => {
  it('carries only numbers, ISO dates and stable codes', () => {
    const plan = planPayments(input());

    const payload = buildExplainPayload(plan, CARDS, {
      today: '2026-10-21',
      rules: DEFAULT_COACH_RULES,
    });

    expect(payload.version).toBe(1);
    expect(payload.items[0]).toEqual({
      step: 1,
      kind: 'minimum',
      card: 'Axis Neo',
      amount: 620,
      payBy: '2026-10-22',
      reasonCode: 'minimum_due_soon',
      utilizationBefore: 19.5,
      utilizationAfter: 18.7,
    });
    expect(payload.leftover).toBe(31000);
    expect(payload.cashUsed).toBe(89000);
    expect(payload.overallUtilizationAfter).toBe(15.3);
    expect(payload.thresholdPct).toBe(30);
    expect(payload.aimFor10).toBe(false);
    expect(payload.summaryCode).toBe(plan.summary.code);
  });

  it('includes shortfalls and survives a JSON round trip', () => {
    const plan = planPayments(input({ cash: 500 }));

    const payload = buildExplainPayload(plan, CARDS, {
      today: '2026-10-21',
      rules: DEFAULT_COACH_RULES,
    });

    expect(payload.shortfalls[0]).toMatchObject({
      card: 'Axis Neo',
      required: 620,
      shortfall: 120,
    });
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

describe('buildTemplateExplanation wording rules', () => {
  const overdueAxis: Card = { ...AXIS, dueDay: 10 };

  it('says "Pay the rest now" for an unfunded overdue minimum, with no due date', () => {
    const plan = planPayments(input({ cards: [overdueAxis], cash: 100 }));

    const text = buildTemplateExplanation(plan, [overdueAxis]);

    expect(plan.shortfalls[0]?.kind).toBe('overdue_minimum');
    expect(text).toContain('Pay the rest now.');
    expect(text).not.toMatch(/Pay the rest by/);
  });

  it('uses overdue wording for an overdue minimum that is funded', () => {
    const plan = planPayments(input({ cards: [overdueAxis], cash: 100000 }));

    const text = buildTemplateExplanation(plan, [overdueAxis]);

    expect(plan.items[0]?.kind).toBe('overdue_minimum');
    expect(text).toMatch(/overdue/i);
  });

  it('only claims no interest when the statement is paid in full', () => {
    const partial = planPayments(input({ cash: 5000 }));
    const full = planPayments(input());

    expect(partial.items.some((i) => i.reason.code === 'statement_partial')).toBe(true);
    const partialText = buildTemplateExplanation(partial, CARDS);
    expect(partialText).toContain('toward the statement');
    expect(partialText).not.toContain('no interest');
    expect(buildTemplateExplanation(full, CARDS)).toContain('no interest');
  });

  it('explains the aimFor10 Aarav plan with the SBI 26,400 prepay and 7,000 left over', () => {
    const plan = planPayments(input({}, { aimFor10: true }));

    const text = buildTemplateExplanation(plan, CARDS);

    expect(text).toContain('₹26,400');
    expect(text).toContain('₹7,000 is left over');
  });
});
