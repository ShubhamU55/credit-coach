import { describe, it, expect } from 'vitest';
import { planPayments } from './planner';
import { DEFAULT_COACH_RULES, type Card, type CoachRules, type PlanInput } from './types';

const TODAY = '2026-10-21';

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

const input = (cards: Card[], cash: number, rules: Partial<CoachRules> = {}): PlanInput => ({
  cards,
  cash,
  today: TODAY,
  rules: { ...DEFAULT_COACH_RULES, ...rules },
});

/** Rohan (recovering persona): Kotak 811 overdue since 12 Oct; ICICI Amazon Pay due 25 Oct. */
const KOTAK = card({
  id: 'kotak-811',
  limit: 50000,
  outstanding: 29000,
  lastStatementBalance: 29000,
  statementDay: 24,
  dueDay: 12,
  minimumDue: 1450,
});
const ICICI = card({
  id: 'icici-amazon',
  limit: 90000,
  outstanding: 57600,
  lastStatementBalance: 57600,
  statementDay: 5,
  dueDay: 25,
  minimumDue: 2880,
});

describe('planPayments: PRD §5.3 acceptance examples', () => {
  it('cash covers everything: every card ends at or under the threshold and the plan says so', () => {
    // Arrange
    const cards = [card({ id: 'a', outstanding: 90000 }), card({ id: 'b', outstanding: 45000 })];

    // Act
    const plan = planPayments(input(cards, 500000));

    // Assert
    expect(plan.withinThreshold).toBe(true);
    expect(plan.summary.code).toBe('all_within_threshold');
    expect(plan.shortfalls).toEqual([]);
    expect(plan.highestCardAfter).toBeLessThanOrEqual(30);
    expect(plan.leftover).toBeGreaterThan(0);
  });

  it('cash below the minimums funds the earliest due first and lists every uncovered card', () => {
    // Arrange: Rohan's example, cash ₹3,000 against minimums of ₹4,330, plus one more card due later
    const later = card({ id: 'later', statementDay: 10, dueDay: 30, minimumDue: 500 });

    // Act
    const plan = planPayments(input([later, ICICI, KOTAK], 3000));

    // Assert
    expect(plan.items.map((i) => [i.kind, i.cardId, i.amount])).toEqual([
      ['overdue_minimum', 'kotak-811', 1450],
      ['minimum', 'icici-amazon', 1550],
    ]);
    expect(plan.shortfalls).toEqual([
      {
        cardId: 'icici-amazon',
        kind: 'minimum',
        required: 2880,
        funded: 1550,
        shortfall: 1330,
        dueDate: '2026-10-25',
      },
      {
        cardId: 'later',
        kind: 'minimum',
        required: 500,
        funded: 0,
        shortfall: 500,
        dueDate: '2026-10-30',
      },
    ]);
    expect(plan.leftover).toBe(0);
    expect(plan.withinThreshold).toBe(false);
    expect(plan.summary).toEqual({
      code: 'shortfall',
      text: 'This cash does not cover every minimum: 2 cards will miss theirs.',
    });
  });

  it('an overdue card comes first, pays immediately and is flagged, whatever its due date', () => {
    // Arrange: a card due today sorts before Kotak by id and by "upcoming" due date
    const dueToday = card({ id: 'a-due-today', statementDay: 1, dueDay: 21, minimumDue: 900 });

    // Act
    const plan = planPayments(input([dueToday, ICICI, KOTAK], 200000));

    // Assert
    expect(plan.items[0]).toMatchObject({
      step: 1,
      kind: 'overdue_minimum',
      cardId: 'kotak-811',
      amount: 1450,
      payBy: TODAY,
      reason: {
        code: 'overdue',
        text: 'This minimum was due on 12 Oct and is unpaid. A missed payment is the most damaging event for your score.',
      },
    });
    expect(plan.items[1]).toMatchObject({
      kind: 'minimum',
      cardId: 'a-due-today',
      reason: {
        code: 'minimum_due_soon',
        text: 'Your minimum is due today. Missing it is the most damaging thing for your score.',
      },
    });
  });

  it('keeps the overdue step first even when the step order is reconfigured', () => {
    const plan = planPayments(
      input([ICICI, KOTAK], 200000, {
        plannerStepOrder: ['prepay', 'statement', 'minimum', 'overdue'],
      }),
    );

    expect(plan.items[0]?.kind).toBe('overdue_minimum');
  });

  it('changing the threshold changes the step-4 amounts', () => {
    // Arrange: a card with no statement due, so step 4 is the only step
    const cards = [card({ id: 'a', lastStatementBalance: 0, minimumDue: 0, outstanding: 40000 })];

    // Act
    const at30 = planPayments(input(cards, 100000, { thresholdPct: 30 }));
    const at20 = planPayments(input(cards, 100000, { thresholdPct: 20 }));

    // Assert
    expect(at30.items.map((i) => [i.kind, i.amount])).toEqual([['prepay', 10000]]);
    expect(at20.items.map((i) => [i.kind, i.amount])).toEqual([['prepay', 20000]]);
  });

  it('never suggests paying more than a card owes, even when its minimum or statement is larger', () => {
    // Arrange: inconsistent data, outstanding below the minimum and the statement
    const cards = [
      card({ id: 'a', outstanding: 500, lastStatementBalance: 4000, minimumDue: 1000 }),
    ];

    // Act
    const plan = planPayments(input(cards, 100000));

    // Assert
    expect(plan.items.map((i) => [i.kind, i.amount])).toEqual([['minimum', 500]]);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.leftover).toBe(99500);
  });

  it('is deterministic and leaves its input untouched', () => {
    // Arrange
    const frozen = Object.freeze(input([ICICI, KOTAK, card({ id: 'z' })], 30000));

    // Act
    const first = planPayments(frozen);
    const second = planPayments(frozen);

    // Assert
    expect(second).toEqual(first);
    expect(frozen.cards).toEqual([ICICI, KOTAK, card({ id: 'z' })]);
  });
});

describe('planPayments: step 3 statement order', () => {
  it('pays the highest known interest rate first, then the earliest due date', () => {
    // Arrange
    const dueSoonNoRate = card({ id: 'a', statementDay: 1, dueDay: 25 });
    const dueLaterHighRate = card({ id: 'b', interestRatePct: 42 });
    const dueLaterLowRate = card({ id: 'c', interestRatePct: 36 });

    // Act
    const plan = planPayments(input([dueSoonNoRate, dueLaterLowRate, dueLaterHighRate], 200000));

    // Assert
    expect(plan.items.filter((i) => i.kind === 'statement').map((i) => i.cardId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('marks a statement it can only part-fund', () => {
    const plan = planPayments(input([card({ id: 'a', minimumDue: 2000 })], 10000));

    expect(plan.items[1]).toMatchObject({
      kind: 'statement',
      amount: 8000,
      reason: {
        code: 'statement_partial',
        text: 'Pays part of the statement. Interest is charged on what stays unpaid.',
      },
    });
  });

  it('still clears the rest of a statement after its due date, paying today', () => {
    // Arrange: Axis-like card, due 22 Oct, minimum paid, statement not; today 24 Oct
    const axis = card({
      id: 'axis',
      statementDay: 2,
      dueDay: 22,
      lastStatementBalance: 12400,
      minimumDue: 620,
      paidSinceStatement: 620,
      outstanding: 14980,
    });

    // Act
    const plan = planPayments({ ...input([axis], 100000), today: '2026-10-24' });

    // Assert
    expect(plan.items[0]).toMatchObject({
      kind: 'statement',
      amount: 11780,
      payBy: '2026-10-24',
      reason: {
        code: 'statement_after_due',
        text: 'The due date has passed. Clearing the rest of the statement stops more interest building up.',
      },
    });
  });
});

describe('planPayments: step 4 utilization pre-payment', () => {
  const noStatement = (id: string, limit: number, outstanding: number): Card =>
    card({ id, limit, outstanding, lastStatementBalance: 0, minimumDue: 0 });

  it('when cash runs short, lowers the highest-utilization card first and says it stays high', () => {
    // Arrange: a at 90%, b at 60%
    const cards = [noStatement('b', 100000, 60000), noStatement('a', 100000, 90000)];

    // Act
    const plan = planPayments(input(cards, 20000));

    // Assert
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      kind: 'prepay',
      cardId: 'a',
      amount: 20000,
      utilizationBefore: 90,
      utilizationAfter: 70,
      reason: { code: 'prepay_partial' },
    });
    expect(plan.withinThreshold).toBe(false);
    expect(plan.summary).toEqual({
      code: 'above_threshold',
      text: 'Some cards stay above 30% this cycle.',
    });
  });

  it('with the 10% switch on, lowers cards toward 10% only after all are at the threshold', () => {
    // Arrange: a 50%, b 40%
    const cards = [noStatement('a', 100000, 50000), noStatement('b', 100000, 40000)];

    // Act
    const plan = planPayments(input(cards, 35000, { aimFor10: true }));

    // Assert: 20,000 takes a to 30% and 10,000 takes b to 30% before the last 5,000 lowers a
    expect(plan.items.map((i) => [i.cardId, i.amount, i.utilizationAfter])).toEqual([
      ['a', 25000, 25],
      ['b', 10000, 30],
    ]);
    expect(plan.leftover).toBe(0);
  });

  it('treats a card a fraction above the threshold as above it (exact, not rounded)', () => {
    // 30,040 of 1,00,000 is 30.04%: displays as 30.0% but still gets a ₹40 pre-payment
    const plan = planPayments(input([noStatement('a', 100000, 30040)], 1000));

    expect(plan.items.map((i) => i.amount)).toEqual([40]);
  });

  it('weekly_current basis: steps 3 and 4 pay by the earlier of due date and snapshot − buffer', () => {
    // Arrange: HDFC-like (due 4 Nov) and Axis-like (due 22 Oct); next snapshot 28 Oct
    const hdfc = card({
      id: 'hdfc',
      limit: 100000,
      outstanding: 81000,
      lastStatementBalance: 74200,
    });
    const axis = card({
      id: 'axis',
      limit: 80000,
      outstanding: 15600,
      lastStatementBalance: 12400,
      statementDay: 2,
      dueDay: 22,
      minimumDue: 620,
    });
    const sbi = noStatement('sbi', 120000, 38400);

    // Act
    const plan = planPayments(
      input([hdfc, axis, sbi], 200000, { reportingBasis: 'weekly_current' }),
    );

    // Assert
    const payBy = plan.items.map((i) => [i.kind, i.cardId, i.payBy]);
    expect(payBy).toEqual([
      ['minimum', 'axis', '2026-10-22'],
      ['minimum', 'hdfc', '2026-11-04'],
      ['statement', 'axis', '2026-10-22'],
      ['statement', 'hdfc', '2026-10-27'],
      ['prepay', 'sbi', '2026-10-27'],
    ]);
    expect(plan.items[4]?.reason.text).toBe(
      'Pay before 28 Oct so ₹36,000 (30%) gets reported instead of ₹38,400 (32%).',
    );
  });
});

describe('planPayments: excluded cards (PRD §5.2)', () => {
  it('still pays the minimum on a card with no valid limit, but never pre-pays it and flags it', () => {
    // Arrange
    const noLimit = card({ id: 'no-limit', limit: 0 });

    // Act
    const plan = planPayments(input([noLimit], 100000));

    // Assert
    expect(plan.items.map((i) => [i.kind, i.utilizationBefore, i.utilizationAfter])).toEqual([
      ['minimum', null, null],
      ['statement', null, null],
    ]);
    expect(plan.excludedCardIds).toEqual(['no-limit']);
    expect(plan.overallUtilizationAfter).toBeNull();
    expect(plan.highestCardAfter).toBeNull();
  });
});
