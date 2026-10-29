import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runWhatIf, type WhatIfCard, type WhatIfContext, type WhatIfResult } from './whatif';
import { overallUtilization, utilization } from './utilization';

const cardArb: fc.Arbitrary<Omit<WhatIfCard, 'id'>> = fc
  .record({
    limit: fc.integer({ min: 1000, max: 1000000 }),
    usePct: fc.integer({ min: 0, max: 130 }),
    ageMonths: fc.integer({ min: 0, max: 300 }),
    isSecured: fc.boolean(),
  })
  .map(({ limit, usePct, ageMonths, isSecured }) => ({
    limit,
    outstanding: Math.round((limit * usePct) / 100),
    ageMonths,
    isSecured,
  }));

/** A consistent context: the predictor input is derived from the cards it describes. */
const contextArb: fc.Arbitrary<WhatIfContext> = fc
  .record({
    cards: fc.array(cardArb, { minLength: 1, maxLength: 5 }),
    anchorScore: fc.integer({ min: 300, max: 900 }),
    hasAnchor: fc.boolean(),
    onTimePayments: fc.integer({ min: 0, max: 120 }),
    missedPayments: fc.integer({ min: 0, max: 6 }),
    hardInquiries6m: fc.integer({ min: 0, max: 6 }),
  })
  .map(({ cards: raw, anchorScore, hasAnchor, hardInquiries6m, ...history }) => {
    const cards = raw.map((c, i) => ({ ...c, id: `card-${i}` }));
    const utils = cards.map((c) => utilization(c.outstanding, c.limit) ?? 0);
    const secured = cards.filter((c) => c.isSecured).length;
    return {
      cards,
      input: {
        ...history,
        ...(hasAnchor ? { anchor: { score: anchorScore, date: '2026-10-02' } } : {}),
        today: '2026-10-21',
        overallUtilizationPct: overallUtilization(cards) ?? 0,
        maxCardUtilizationPct: Math.max(...utils),
        hardInquiries6m,
        hardInquiries12m: hardInquiries6m,
        oldestAccountMonths: Math.max(...cards.map((c) => c.ageMonths)),
        openAccounts: cards.length,
        securedAccounts: secured,
        unsecuredAccounts: cards.length - secured,
      },
    };
  });

const ok = (result: WhatIfResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
};

/** Every key anywhere in a value. */
const collectKeys = (value: unknown, into: string[] = []): string[] => {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, into));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      into.push(key);
      collectKeys(v, into);
    }
  }
  return into;
};

/** fast-check suites run hundreds of cases; allow for a loaded CI or dev machine. */
const PROPERTY_TIMEOUT_MS = 30_000;

describe('runWhatIf properties (PRD §5.5 acceptance)', { timeout: PROPERTY_TIMEOUT_MS }, () => {
  // criterion: "close card Y" lowers the total limit and shows utilization rising
  it('closing any card never raises the estimate, never lowers utilization, and always warns', () => {
    fc.assert(
      fc.property(contextArb, fc.nat(), (context, pick) => {
        // Arrange
        const card = context.cards[pick % context.cards.length] as WhatIfCard;

        // Act
        const result = ok(runWhatIf(context, { kind: 'close-card', cardId: card.id }));

        // Assert
        expect(result.after.low).toBeLessThanOrEqual(result.before.low);
        expect(result.after.high).toBeLessThanOrEqual(result.before.high);
        expect(result.utilization.overallAfter).toBeGreaterThanOrEqual(
          result.utilization.overallBefore,
        );
        expect(result.totalLimit.after).toBe(result.totalLimit.before - card.limit);
        expect(result.warnings.map((w) => w.kind)).toEqual(['limit-loss', 'credit-age']);
        const isOldest = card.ageMonths === context.input.oldestAccountMonths;
        expect(result.warnings[1]).toMatchObject({ isOldestAccount: isOldest });
      }),
    );
  });

  it('paying any amount on any card never lowers the estimate or raises utilization', () => {
    fc.assert(
      fc.property(
        contextArb,
        fc.nat(),
        fc.integer({ min: 1, max: 2000000 }),
        (context, pick, amount) => {
          const card = context.cards[pick % context.cards.length] as WhatIfCard;
          const result = ok(runWhatIf(context, { kind: 'pay-card', cardId: card.id, amount }));
          expect(result.after.low).toBeGreaterThanOrEqual(result.before.low);
          expect(result.after.high).toBeGreaterThanOrEqual(result.before.high);
          expect(result.utilization.overallAfter).toBeLessThanOrEqual(
            result.utilization.overallBefore,
          );
          expect(result.utilization.maxCardAfter).toBeLessThanOrEqual(
            result.utilization.maxCardBefore,
          );
        },
      ),
    );
  });

  it('missing a payment or applying never raises the estimate', () => {
    fc.assert(
      fc.property(contextArb, (context) => {
        for (const scenario of [
          { kind: 'miss-payment' as const },
          { kind: 'apply' as const, product: 'loan' as const },
        ]) {
          const result = ok(runWhatIf(context, scenario));
          expect(result.after.low).toBeLessThanOrEqual(result.before.low);
          expect(result.after.high).toBeLessThanOrEqual(result.before.high);
        }
      }),
    );
  });

  // criterion: no output field ever carries one exact score (non-negotiable 3)
  it('no scenario output carries a single score: only ranges with low < high', () => {
    fc.assert(
      fc.property(contextArb, fc.integer({ min: 1, max: 500000 }), (context, amount) => {
        const id = (context.cards[0] as WhatIfCard).id;
        const scenarios = [
          { kind: 'pay-card' as const, cardId: id, amount },
          { kind: 'follow-plan' as const, payments: [{ cardId: id, amount }] },
          { kind: 'miss-payment' as const },
          { kind: 'close-card' as const, cardId: id },
          { kind: 'apply' as const, product: 'card' as const },
          { kind: 'fd-card' as const, fdAmount: amount },
        ];
        for (const scenario of scenarios) {
          const result = ok(runWhatIf(context, scenario));
          expect(collectKeys(result).filter((k) => /score|center|exact|point$/i.test(k))).toEqual(
            [],
          );
          const estimates = [result.before, result.after];
          if (result.guard) estimates.push(result.guard.estimateBefore, result.guard.estimateAfter);
          for (const e of estimates) {
            expect(e.low).toBeLessThan(e.high);
            expect(e.low).toBeGreaterThanOrEqual(300);
            expect(e.high).toBeLessThanOrEqual(900);
          }
          expect(result.reasons.length).toBeLessThanOrEqual(3);
        }
      }),
    );
  });
});
