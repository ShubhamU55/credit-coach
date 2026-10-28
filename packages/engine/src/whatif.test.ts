import { describe, it, expect } from 'vitest';
import { runWhatIf, type WhatIfCard, type WhatIfContext, type WhatIfResult } from './whatif';
import type { PredictorInput } from './predictor';

/**
 * Aarav's cards (docs/design.md §8). The fixture gives only HDFC's age (6 yrs 2 mo); the SBI
 * and Axis ages are test assumptions (both younger than HDFC).
 */
const CARDS: WhatIfCard[] = [
  { id: 'hdfc', limit: 100000, outstanding: 81000, ageMonths: 74, isSecured: false },
  { id: 'sbi', limit: 120000, outstanding: 38400, ageMonths: 38, isSecured: false },
  { id: 'axis', limit: 80000, outstanding: 15600, ageMonths: 20, isSecured: false },
];

const AARAV: PredictorInput = {
  anchor: { score: 724, date: '2026-10-02' },
  today: '2026-10-21',
  onTimePayments: 36,
  missedPayments: 0,
  overallUtilizationPct: 45,
  maxCardUtilizationPct: 81,
  hardInquiries6m: 1,
  hardInquiries12m: 1,
  oldestAccountMonths: 74,
  openAccounts: 3,
  securedAccounts: 0,
  unsecuredAccounts: 3,
};

const CONTEXT: WhatIfContext = { input: AARAV, cards: CARDS };

/** The plan's payments (docs/design.md §8), with step 05 depending on the 10% switch. */
const planPayments = (sbiAmount: number) => [
  { cardId: 'axis', amount: 620 },
  { cardId: 'hdfc', amount: 3710 },
  { cardId: 'axis', amount: 11780 },
  { cardId: 'hdfc', amount: 70490 },
  { cardId: 'sbi', amount: sbiAmount },
];

/** Narrows a result to its success branch, failing the test otherwise. */
const ok = (result: WhatIfResult) => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
};

const range = (e: { low: number; high: number }): [number, number] => [e.low, e.high];

describe("runWhatIf: follow this month's plan", () => {
  it('gives 724-752 from 708-736 with the 10% switch off', () => {
    // Act
    const result = ok(runWhatIf(CONTEXT, { kind: 'follow-plan', payments: planPayments(2400) }));

    // Assert
    expect(range(result.before)).toEqual([708, 736]);
    expect(range(result.after)).toEqual([724, 752]);
    expect(result.utilization).toEqual({
      overallBefore: 45,
      overallAfter: 15.3,
      maxCardBefore: 81,
      maxCardAfter: 30,
    });
    expect(result.warnings).toEqual([]);
  });

  it('gives 731-759 with the 10% switch on', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'follow-plan', payments: planPayments(26400) }));
    expect(range(result.after)).toEqual([731, 759]);
    expect(result.utilization.overallAfter).toBe(7.3);
    expect(result.utilization.maxCardAfter).toBe(10);
  });

  it('explains the change with utilization reasons that carry before and after', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'follow-plan', payments: planPayments(2400) }));
    expect(result.reasons).toEqual([
      {
        factor: 'maxCardUtilization',
        direction: 'up',
        previous: { pct: 81 },
        current: { pct: 30 },
      },
      {
        factor: 'overallUtilization',
        direction: 'up',
        previous: { pct: 45 },
        current: { pct: 15.3 },
      },
    ]);
  });

  it('changes nothing for an empty plan', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'follow-plan', payments: [] }));
    expect(result.after).toEqual(result.before);
    expect(result.reasons).toEqual([]);
  });
});

describe('runWhatIf: pay an amount on a card', () => {
  it('lowers that card and overall utilization and never lowers the estimate', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'pay-card', cardId: 'hdfc', amount: 10000 }));
    expect(result.utilization.overallAfter).toBe(41.7);
    expect(result.utilization.maxCardAfter).toBe(71);
    expect(result.after.low).toBeGreaterThanOrEqual(result.before.low);
  });

  it('never pays more than the outstanding', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'pay-card', cardId: 'axis', amount: 999999 }));
    expect(result.utilization.overallAfter).toBe(39.8);
  });

  it('rejects an unknown card and an amount that is not a positive whole rupee', () => {
    expect(runWhatIf(CONTEXT, { kind: 'pay-card', cardId: 'nope', amount: 100 })).toEqual({
      ok: false,
      error: 'unknown-card',
    });
    for (const amount of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(runWhatIf(CONTEXT, { kind: 'pay-card', cardId: 'hdfc', amount })).toEqual({
        ok: false,
        error: 'invalid-amount',
      });
    }
  });

  it('rejects a plan payment on an unknown card', () => {
    const payments = [...planPayments(2400), { cardId: 'kotak', amount: 100 }];
    expect(runWhatIf(CONTEXT, { kind: 'follow-plan', payments })).toEqual({
      ok: false,
      error: 'unknown-card',
    });
  });

  it('rejects cards that share an id instead of letting the last one overwrite the first', () => {
    // Arrange: a second card with the id 'hdfc'
    const second: WhatIfCard = {
      id: 'hdfc',
      limit: 50000,
      outstanding: 0,
      ageMonths: 2,
      isSecured: false,
    };
    const dup: WhatIfContext = { ...CONTEXT, cards: [...CARDS, second] };

    // Act / Assert
    for (const scenario of [
      { kind: 'pay-card' as const, cardId: 'hdfc', amount: 1000 },
      { kind: 'follow-plan' as const, payments: planPayments(2400) },
      { kind: 'close-card' as const, cardId: 'hdfc' },
    ]) {
      expect(runWhatIf(dup, scenario)).toEqual({ ok: false, error: 'duplicate-card-id' });
    }
  });
});

describe('runWhatIf: miss a payment', () => {
  it('lowers the estimate and says why', () => {
    // Act
    const result = ok(runWhatIf(CONTEXT, { kind: 'miss-payment', cardId: 'axis' }));

    // Assert
    expect(range(result.after)).toEqual([686, 714]);
    expect(result.reasons[0]).toEqual({
      factor: 'paymentHistory',
      direction: 'down',
      previous: { onTimePayments: 36, missedPayments: 0 },
      current: { onTimePayments: 36, missedPayments: 1 },
    });
  });

  it('rejects an unknown card', () => {
    expect(runWhatIf(CONTEXT, { kind: 'miss-payment', cardId: 'nope' })).toEqual({
      ok: false,
      error: 'unknown-card',
    });
  });
});

describe('runWhatIf: close a card (non-negotiable 4)', () => {
  it('closing the oldest card raises utilization and warns about credit age and limit loss', () => {
    // Act
    const result = ok(runWhatIf(CONTEXT, { kind: 'close-card', cardId: 'hdfc' }));

    // Assert
    expect(result.utilization.overallBefore).toBe(45);
    expect(result.utilization.overallAfter).toBe(67.5);
    expect(result.utilization.maxCardAfter).toBe(81);
    expect(result.totalLimit).toEqual({ before: 300000, after: 200000 });
    expect(result.warnings).toEqual([
      { kind: 'limit-loss', limitLost: 100000, totalLimitBefore: 300000, totalLimitAfter: 200000 },
      {
        kind: 'credit-age',
        isOldestAccount: true,
        oldestAccountMonthsBefore: 74,
        oldestAccountMonthsAfter: 38,
      },
    ]);
    expect(result.after.high).toBeLessThan(result.before.high);
    expect(range(result.after)).toEqual([698, 726]);
  });

  it('closing a younger card still warns about limit loss and credit age, not as oldest', () => {
    const result = ok(runWhatIf(CONTEXT, { kind: 'close-card', cardId: 'axis' }));
    expect(result.utilization.overallAfter).toBe(61.4);
    expect(result.warnings).toEqual([
      { kind: 'limit-loss', limitLost: 80000, totalLimitBefore: 300000, totalLimitAfter: 220000 },
      {
        kind: 'credit-age',
        isOldestAccount: false,
        oldestAccountMonthsBefore: 74,
        oldestAccountMonthsAfter: 74,
      },
    ]);
  });

  it('closing the only card leaves utilization at least as high as before', () => {
    const context: WhatIfContext = {
      input: { ...AARAV, overallUtilizationPct: 81, openAccounts: 1, unsecuredAccounts: 1 },
      cards: [CARDS[0] as WhatIfCard],
    };
    const result = ok(runWhatIf(context, { kind: 'close-card', cardId: 'hdfc' }));
    expect(result.utilization.overallAfter).toBe(100);
    expect(result.totalLimit.after).toBe(0);
    expect(result.warnings[1]).toMatchObject({ oldestAccountMonthsAfter: 0 });
  });

  it('rejects an unknown card', () => {
    expect(runWhatIf(CONTEXT, { kind: 'close-card', cardId: 'nope' })).toEqual({
      ok: false,
      error: 'unknown-card',
    });
  });
});

describe('runWhatIf: apply for a new card or loan', () => {
  it('adds a hard inquiry and carries the application guard', () => {
    // Act
    const result = ok(runWhatIf(CONTEXT, { kind: 'apply', product: 'card' }));

    // Assert
    expect(range(result.after)).toEqual([704, 732]);
    expect(result.guard).toMatchObject({ shouldWarn: false, hardInquiries6m: 1, threshold: 2 });
    expect(result.reasons[0]).toMatchObject({ factor: 'hardInquiries', direction: 'down' });
  });

  it('warns through the guard at 2 hard inquiries in 6 months', () => {
    const context = { ...CONTEXT, input: { ...AARAV, hardInquiries6m: 2, hardInquiries12m: 2 } };
    const result = ok(runWhatIf(context, { kind: 'apply', product: 'loan' }));
    expect(result.guard?.shouldWarn).toBe(true);
  });
});

describe('runWhatIf: open an FD-backed card', () => {
  it('adds a secured limit at 90% of the FD and a hard inquiry, with the guard', () => {
    // Act
    const result = ok(runWhatIf(CONTEXT, { kind: 'fd-card', fdAmount: 50000 }));

    // Assert
    expect(result.totalLimit).toEqual({ before: 300000, after: 345000 });
    expect(result.utilization.overallAfter).toBe(39.1);
    expect(result.guard).toBeDefined();
    expect(result.reasons.map((r) => r.factor)).toContain('creditMix');
  });

  it('rejects an FD amount that is not a positive whole rupee', () => {
    expect(runWhatIf(CONTEXT, { kind: 'fd-card', fdAmount: 0 })).toEqual({
      ok: false,
      error: 'invalid-amount',
    });
  });
});
