import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { planPayments } from './planner';
import { addDays } from './reporting';
import { PLANNER_STEPS, type Card, type PlanInput } from './types';

/**
 * Generators stay at or under ₹1,00,00,00,000 (1e9) per amount, so every integer product the
 * planner forms (limit × percent, sums across cards) stays far below 2^53.
 */
const MAX_RUPEES = 1_000_000_000;
/** Days from 2024-01-01 to cover leap years 2024 and 2028 and every month-end in between. */
const DAY_SPAN = 365 * 6;

const cardArb = (id: string): fc.Arbitrary<Card> =>
  fc.record({
    id: fc.constant(id),
    name: fc.constant(id),
    issuer: fc.constant('Bank'),
    limit: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: MAX_RUPEES })),
    outstanding: fc.integer({ min: -50_000, max: MAX_RUPEES }),
    lastStatementBalance: fc.integer({ min: 0, max: MAX_RUPEES }),
    statementDay: fc.integer({ min: 1, max: 31 }),
    dueDay: fc.integer({ min: 1, max: 31 }),
    minimumDue: fc.integer({ min: 0, max: MAX_RUPEES / 10 }),
    paidSinceStatement: fc.integer({ min: 0, max: MAX_RUPEES }),
    interestRatePct: fc.option(fc.integer({ min: 0, max: 60 }), { nil: undefined }),
  });

const inputArb: fc.Arbitrary<PlanInput> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 6 })
  .chain((ids) =>
    fc.record({
      cards: fc.tuple(...ids.map(cardArb)),
      cash: fc.integer({ min: 0, max: MAX_RUPEES }),
      today: fc.integer({ min: 0, max: DAY_SPAN }).map((n) => addDays('2024-01-01', n)),
      rules: fc.record({
        thresholdPct: fc.integer({ min: 0, max: 100 }),
        excellentPct: fc.integer({ min: 0, max: 100 }),
        reportingBasis: fc.constantFrom('statement' as const, 'weekly_current' as const),
        payByBufferDays: fc.integer({ min: 0, max: 10 }),
        aimFor10: fc.boolean(),
        plannerStepOrder: fc.shuffledSubarray([...PLANNER_STEPS], {
          minLength: PLANNER_STEPS.length,
          maxLength: PLANNER_STEPS.length,
        }),
      }),
    }),
  );

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);

describe('planPayments properties', () => {
  it('allocates exactly the cash: Σ amounts + leftover = cash', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const plan = planPayments(input);
        expect(sum(plan.items.map((i) => i.amount)) + plan.leftover).toBe(input.cash);
      }),
    );
  });

  it('never plans a zero, negative or fractional amount, and never a negative leftover', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const plan = planPayments(input);
        for (const item of plan.items) {
          expect(Number.isSafeInteger(item.amount)).toBe(true);
          expect(item.amount).toBeGreaterThan(0);
        }
        expect(Number.isSafeInteger(plan.leftover)).toBe(true);
        expect(plan.leftover).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("never plans more for a card, summed over its items, than the card's outstanding", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const plan = planPayments(input);
        for (const card of input.cards) {
          const planned = sum(plan.items.filter((i) => i.cardId === card.id).map((i) => i.amount));
          expect(planned).toBeLessThanOrEqual(Math.max(0, card.outstanding));
        }
      }),
    );
  });

  it('leaves cash over only when nothing is short and every card is at or under the threshold', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const plan = planPayments(input);
        if (plan.leftover > 0) {
          expect(plan.shortfalls).toEqual([]);
          expect(plan.withinThreshold).toBe(true);
        }
      }),
    );
  });

  it('reports every shortfall consistently: shortfall = required − funded > 0', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const s of planPayments(input).shortfalls) {
          expect(s.shortfall).toBe(s.required - s.funded);
          expect(s.shortfall).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('numbers steps 1..n, puts overdue minimums first and never asks to pay before today', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { items } = planPayments(input);
        expect(items.map((i) => i.step)).toEqual(items.map((_, i) => i + 1));
        const firstOther = items.findIndex((i) => i.kind !== 'overdue_minimum');
        if (firstOther >= 0) {
          expect(items.slice(firstOther).some((i) => i.kind === 'overdue_minimum')).toBe(false);
        }
        for (const item of items) expect(item.payBy >= input.today).toBe(true);
      }),
    );
  });

  it('is deterministic and independent of the order the cards are listed in', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const plan = planPayments(input);
        expect(planPayments(input)).toEqual(plan);
        expect(planPayments({ ...input, cards: [...input.cards].reverse() })).toEqual(plan);
      }),
    );
  });
});
