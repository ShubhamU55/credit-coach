import { describe, it, expect } from 'vitest';
import { planPayments } from './planner';
import { DEFAULT_COACH_RULES, type Card, type CoachRules, type PlanInput } from './types';

// Boundaries (edge-case-hunter checklist, applied by hand): zero cash, no cards, credit balances,
// overpaid statements, the excellent line above the threshold, leap-day and month-end "today",
// and malformed input.

const card = (overrides: Partial<Card> & Pick<Card, 'id'>): Card => ({
  name: overrides.id,
  issuer: 'Test bank',
  limit: 100000,
  outstanding: 50000,
  lastStatementBalance: 40000,
  statementDay: 15,
  dueDay: 4,
  minimumDue: 2000,
  paidSinceStatement: 0,
  ...overrides,
});

const input = (
  cards: Card[],
  cash: number,
  rules: Partial<CoachRules> = {},
  today = '2026-10-21',
): PlanInput => ({ cards, cash, today, rules: { ...DEFAULT_COACH_RULES, ...rules } });

describe('planPayments boundaries', () => {
  it('zero cash: no items, every minimum listed as a shortfall, nothing left over', () => {
    const plan = planPayments(input([card({ id: 'a' })], 0));

    expect(plan.items).toEqual([]);
    expect(plan.shortfalls).toEqual([
      {
        cardId: 'a',
        kind: 'minimum',
        required: 2000,
        funded: 0,
        shortfall: 2000,
        dueDate: '2026-11-04',
      },
    ]);
    expect(plan.leftover).toBe(0);
    expect(plan.leftoverReason).toBeNull();
    expect(plan.summary).toEqual({
      code: 'shortfall',
      text: 'This cash does not cover every minimum: 1 card will miss its minimum.',
    });
  });

  it('no cards: an empty plan that keeps all the cash', () => {
    const plan = planPayments(input([], 5000));

    expect(plan).toMatchObject({
      items: [],
      shortfalls: [],
      leftover: 5000,
      overallUtilizationBefore: null,
      overallUtilizationAfter: null,
      highestCardBefore: null,
      highestCardAfter: null,
      withinThreshold: true,
      excludedCardIds: [],
    });
  });

  it('a credit balance (negative outstanding) is treated as nothing owed', () => {
    const plan = planPayments(input([card({ id: 'a', outstanding: -1200 })], 10000));

    expect(plan.items).toEqual([]);
    expect(plan.leftover).toBe(10000);
    expect(plan.overallUtilizationBefore).toBe(0);
  });

  it('a statement overpaid since it was issued needs nothing more', () => {
    const overpaid = card({ id: 'a', outstanding: 20000, paidSinceStatement: 45000 });

    const plan = planPayments(input([overpaid], 10000));

    expect(plan.items).toEqual([]);
  });

  it('an excellent line above the threshold changes nothing when the switch is on', () => {
    const cards = [card({ id: 'a', lastStatementBalance: 0, minimumDue: 0, outstanding: 60000 })];

    const on = planPayments(input(cards, 100000, { aimFor10: true, excellentPct: 40 }));
    const off = planPayments(input(cards, 100000));

    expect(on.items.map((i) => i.amount)).toEqual(off.items.map((i) => i.amount));
  });

  it('a 0% threshold pays a card down to nothing', () => {
    const cards = [card({ id: 'a', lastStatementBalance: 0, minimumDue: 0, outstanding: 7000 })];

    const plan = planPayments(input(cards, 100000, { thresholdPct: 0 }));

    expect(plan.items.map((i) => [i.amount, i.utilizationAfter])).toEqual([[7000, 0]]);
  });

  it('leap day: on 29 Feb 2028 a 29th-statement card pre-pays by 28 Mar', () => {
    const cards = [
      card({
        id: 'a',
        statementDay: 29,
        lastStatementBalance: 0,
        minimumDue: 0,
        outstanding: 40000,
      }),
    ];

    const plan = planPayments(input(cards, 100000, {}, '2028-02-29'));

    expect(plan.items.map((i) => [i.kind, i.payBy])).toEqual([['prepay', '2028-03-28']]);
  });

  it('weekly basis at a non-leap February month-end reports on 7 Mar and pays by 6 Mar', () => {
    const cards = [card({ id: 'a', lastStatementBalance: 0, minimumDue: 0, outstanding: 40000 })];

    const plan = planPayments(
      input(cards, 100000, { reportingBasis: 'weekly_current' }, '2027-02-28'),
    );

    expect(plan.items[0]?.payBy).toBe('2027-03-06');
    expect(plan.items[0]?.reason.text).toContain('Pay before 7 Mar');
  });

  it('pays an overdue minimum it can only part-cover and lists the overdue shortfall', () => {
    // Statement 24 Sep, due 12 Oct, unpaid; today 21 Oct
    const overdue = card({ id: 'a', statementDay: 24, dueDay: 12, minimumDue: 1450 });

    const plan = planPayments(input([overdue], 1000));

    expect(plan.items.map((i) => [i.kind, i.amount])).toEqual([['overdue_minimum', 1000]]);
    expect(plan.shortfalls).toEqual([
      {
        cardId: 'a',
        kind: 'overdue_minimum',
        required: 1450,
        funded: 1000,
        shortfall: 450,
        dueDate: '2026-10-12',
      },
    ]);
  });
});

describe('planPayments rejects malformed input with a RangeError', () => {
  const ok = input([card({ id: 'a' })], 1000);

  it.each([
    ['fractional cash', { ...ok, cash: 10.5 }],
    ['negative cash', { ...ok, cash: -1 }],
    ['NaN cash', { ...ok, cash: Number.NaN }],
    ['an impossible today', { ...ok, today: '2026-02-30' }],
    ['duplicate card ids', { ...ok, cards: [card({ id: 'a' }), card({ id: 'a' })] }],
    ['a negative minimum', { ...ok, cards: [card({ id: 'a', minimumDue: -5 })] }],
    ['a fractional outstanding', { ...ok, cards: [card({ id: 'a', outstanding: 1.5 })] }],
    ['a NaN interest rate', { ...ok, cards: [card({ id: 'a', interestRatePct: Number.NaN })] }],
    ['a threshold over 100', { ...ok, rules: { ...ok.rules, thresholdPct: 101 } }],
    ['a negative excellent line', { ...ok, rules: { ...ok.rules, excellentPct: -1 } }],
    [
      'a step order missing a step',
      { ...ok, rules: { ...ok.rules, plannerStepOrder: ['overdue', 'minimum', 'statement'] } },
    ],
    [
      'a step order repeating a step',
      {
        ...ok,
        rules: { ...ok.rules, plannerStepOrder: ['overdue', 'minimum', 'minimum', 'prepay'] },
      },
    ],
  ] as const)('rejects %s', (_label, bad) => {
    expect(() => planPayments(bad as PlanInput)).toThrow(RangeError);
  });
});
