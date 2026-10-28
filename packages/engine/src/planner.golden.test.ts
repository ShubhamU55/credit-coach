import { describe, it, expect } from 'vitest';
import { planPayments } from './planner';
import { DEFAULT_COACH_RULES, type Card, type CoachRules, type PlanInput } from './types';

/**
 * The Aarav golden fixture: docs/design.md §8 and .design/credit-coach/INFORMATION_ARCHITECTURE.md
 * ("Canonical sample data"). Today = Wed 21 Oct 2026, cash ₹1,20,000, statement basis.
 * No card carries an interest rate, so step 3 runs in due-date order.
 */
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

const aarav = (rules: Partial<CoachRules> = {}, cards: Card[] = [HDFC, SBI, AXIS]): PlanInput => ({
  cards,
  cash: 120000,
  today: '2026-10-21',
  rules: { ...DEFAULT_COACH_RULES, ...rules },
});

/** Steps 01-04 are the same in every Aarav variant. */
const STEPS_01_TO_04 = [
  {
    step: 1,
    kind: 'minimum',
    cardId: 'axis-neo',
    amount: 620,
    payBy: '2026-10-22',
    reason: {
      code: 'minimum_due_soon',
      text: 'Your minimum is due tomorrow. Missing it is the most damaging thing for your score.',
    },
    utilizationBefore: 19.5,
    utilizationAfter: 18.7,
  },
  {
    step: 2,
    kind: 'minimum',
    cardId: 'hdfc-millennia',
    amount: 3710,
    payBy: '2026-11-04',
    reason: { code: 'minimum_due', text: 'Minimum due on 4 Nov.' },
    utilizationBefore: 81.0,
    utilizationAfter: 77.3,
  },
  {
    step: 3,
    kind: 'statement',
    cardId: 'axis-neo',
    amount: 11780,
    payBy: '2026-10-22',
    reason: { code: 'statement_full', text: 'Pays off the full statement, so no interest.' },
    utilizationBefore: 18.7,
    utilizationAfter: 4.0,
  },
  {
    step: 4,
    kind: 'statement',
    cardId: 'hdfc-millennia',
    amount: 70490,
    payBy: '2026-11-04',
    reason: { code: 'statement_full', text: 'Pays off the full statement, so no interest.' },
    utilizationBefore: 77.3,
    utilizationAfter: 6.8,
  },
];

describe('planPayments: Aarav golden plan (docs/design.md §8)', () => {
  it('10% switch on: steps 01-05, overall 7.3%, highest card 10.0%, left over ₹7,000', () => {
    // Act
    const plan = planPayments(aarav({ aimFor10: true }));

    // Assert
    expect(plan.items).toEqual([
      ...STEPS_01_TO_04,
      {
        step: 5,
        kind: 'prepay',
        cardId: 'sbi-simplyclick',
        amount: 26400,
        payBy: '2026-10-24',
        reason: {
          code: 'prepay_excellent',
          text: 'Pay before 25 Oct so ₹12,000 (10%) gets reported instead of ₹38,400 (32%).',
        },
        utilizationBefore: 32.0,
        utilizationAfter: 10.0,
      },
    ]);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.leftover).toBe(7000);
    expect(plan.overallUtilizationBefore).toBe(45.0);
    expect(plan.overallUtilizationAfter).toBe(7.3);
    expect(plan.highestCardBefore).toBe(81.0);
    expect(plan.highestCardAfter).toBe(10.0);
    expect(plan.withinThreshold).toBe(true);
    expect(plan.excludedCardIds).toEqual([]);
  });

  it('10% switch off (the default): step 05 is SBI ₹2,400, overall 15.3%, highest 30.0%, left over ₹31,000', () => {
    // Act
    const plan = planPayments(aarav());

    // Assert
    expect(plan.items).toEqual([
      ...STEPS_01_TO_04,
      {
        step: 5,
        kind: 'prepay',
        cardId: 'sbi-simplyclick',
        amount: 2400,
        payBy: '2026-10-24',
        reason: {
          code: 'prepay_threshold',
          text: 'Pay before 25 Oct so ₹36,000 (30%) gets reported instead of ₹38,400 (32%).',
        },
        utilizationBefore: 32.0,
        utilizationAfter: 30.0,
      },
    ]);
    expect(plan.leftover).toBe(31000);
    expect(plan.leftoverReason).toEqual({
      code: 'nothing_more_needed',
      text: 'Nothing more needed this cycle.',
    });
    expect(plan.overallUtilizationAfter).toBe(15.3);
    expect(plan.highestCardAfter).toBe(30.0);
    expect(plan.summary).toEqual({
      code: 'all_within_threshold',
      text: 'Every card ends at or under 30%.',
    });
  });

  it('admin demo moment, threshold 20% and switch off: step 05 is SBI ₹14,400 (32.0 → 20.0), left over ₹19,000', () => {
    // Act
    const plan = planPayments(aarav({ thresholdPct: 20 }));

    // Assert
    expect(plan.items.slice(0, 4)).toEqual(STEPS_01_TO_04);
    expect(plan.items[4]).toMatchObject({
      step: 5,
      kind: 'prepay',
      cardId: 'sbi-simplyclick',
      amount: 14400,
      payBy: '2026-10-24',
      reason: {
        code: 'prepay_threshold',
        text: 'Pay before 25 Oct so ₹24,000 (20%) gets reported instead of ₹38,400 (32%).',
      },
      utilizationBefore: 32.0,
      utilizationAfter: 20.0,
    });
    expect(plan.items).toHaveLength(5);
    expect(plan.leftover).toBe(19000);
  });

  it('gives the same plan when SBI encodes "paid in full" as a statement fully paid since', () => {
    // Arrange
    const sbiPaidSince: Card = {
      ...SBI,
      lastStatementBalance: 21000,
      minimumDue: 1050,
      paidSinceStatement: 21000,
    };

    // Act
    const plan = planPayments(aarav({ aimFor10: true }, [HDFC, sbiPaidSince, AXIS]));

    // Assert
    expect(plan).toEqual(planPayments(aarav({ aimFor10: true })));
  });

  it('does not depend on the order the cards are listed in', () => {
    expect(planPayments(aarav({}, [AXIS, HDFC, SBI]))).toEqual(planPayments(aarav()));
  });
});

/** Records a payment the way "Mark as paid" does: lowers the outstanding, raises paid-since. */
const markPaid = (input: PlanInput, cardId: string, amount: number): PlanInput => ({
  ...input,
  cash: input.cash - amount,
  cards: input.cards.map((c) =>
    c.id === cardId
      ? {
          ...c,
          outstanding: c.outstanding - amount,
          paidSinceStatement: c.paidSinceStatement + amount,
        }
      : c,
  ),
});

describe('planPayments: re-planning after "Mark as paid" (PRD §5.3 payment tracking)', () => {
  it('drops a paid step and keeps every later step and the left over unchanged', () => {
    // Arrange
    const start = aarav({ aimFor10: true });
    const before = planPayments(start);
    const renumber = (from: number) =>
      before.items.slice(from).map((item, i) => ({ ...item, step: i + 1 }));

    // Act: mark steps 01, 02 and 03 paid, re-planning after each
    const afterStep1 = markPaid(start, 'axis-neo', 620);
    const afterStep2 = markPaid(afterStep1, 'hdfc-millennia', 3710);
    const afterStep3 = markPaid(afterStep2, 'axis-neo', 11780);

    // Assert
    for (const [input, from] of [
      [afterStep1, 1],
      [afterStep2, 2],
      [afterStep3, 3],
    ] as const) {
      const plan = planPayments(input);
      expect(plan.items).toEqual(renumber(from));
      expect(plan.leftover).toBe(7000);
      expect(plan.overallUtilizationAfter).toBe(7.3);
    }
  });
});
