import { DEMO_TODAY } from './config';
import { createDemoRepository } from './repository';
import { RepositoryError } from './types';

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
}

function card(repo: ReturnType<typeof createDemoRepository>, id: string) {
  const found = repo.listCards().find((c) => c.id === id);
  if (!found) throw new Error(`missing card ${id}`);
  return found;
}

describe('demo config', () => {
  it('fixes demo today at 21 Oct 2026', () => {
    expect(DEMO_TODAY).toBe('2026-10-21');
  });
});

describe('createDemoRepository seed', () => {
  it('returns the Aarav profile with a masked PAN', () => {
    const profile = createDemoRepository().getProfile();

    expect(profile.firstName).toBe('Aarav');
    expect(profile.isSample).toBe(true);
    expect(profile.panMasked).toBe('ABXXXXX34F');
    expect(profile.cashForCards).toBe(120000);
    expect(profile.history.anchorScore).toBe(724);
  });

  it('lists the three canonical cards totalling 1,35,000 of 3,00,000', () => {
    const cards = createDemoRepository().listCards();

    expect(cards.map((c) => c.id)).toEqual(['hdfc-millennia', 'sbi-simplyclick', 'axis-neo']);
    expect(cards.reduce((sum, c) => sum + c.outstanding, 0)).toBe(135000);
    expect(cards.reduce((sum, c) => sum + c.limit, 0)).toBe(300000);
  });

  it('carries the canonical statement and due-day data', () => {
    const repo = createDemoRepository();

    expect(card(repo, 'hdfc-millennia')).toMatchObject({
      outstanding: 81000,
      lastStatementBalance: 74200,
      minimumDue: 3710,
      statementDay: 15,
      dueDay: 4,
    });
    expect(card(repo, 'axis-neo')).toMatchObject({
      outstanding: 15600,
      lastStatementBalance: 12400,
      minimumDue: 620,
      statementDay: 2,
      dueDay: 22,
    });
    // SBI was paid in full: no due date this cycle (adapters map the null dueDay).
    expect(card(repo, 'sbi-simplyclick')).toMatchObject({
      outstanding: 38400,
      minimumDue: 0,
      statementDay: 25,
      dueDay: null,
    });
  });

  it('carries card age in months and the secured flag for the predictor', () => {
    const cards = createDemoRepository().listCards();

    expect(cards.map((c) => [c.id, c.ageMonths, c.isSecured])).toEqual([
      ['hdfc-millennia', 74, false],
      ['sbi-simplyclick', 38, false],
      ['axis-neo', 20, false],
    ]);
    expect(createDemoRepository().getProfile().history).toMatchObject({
      hardInquiries6m: 1,
      hardInquiries12m: 1,
      oldestAccountMonths: 74,
    });
  });

  it('holds no derived dates: screens compute them from DEMO_TODAY via the engine', () => {
    for (const c of createDemoRepository().listCards()) {
      expect(c).not.toHaveProperty('dueDate');
      expect(c).not.toHaveProperty('nextStatementDate');
      expect(c).not.toHaveProperty('lastStatementDate');
    }
  });

  it('exposes the default rules with the 10% switch off', () => {
    expect(createDemoRepository().getRules()).toEqual({
      thresholdPct: 30,
      excellentPct: 10,
      reportingBasis: 'statement',
      aimFor10: false,
    });
  });
});

describe('recordPayment', () => {
  it('lowers that card outstanding and raises paidSinceStatement', () => {
    const repo = createDemoRepository();

    repo.recordPayment('axis-neo', 620, DEMO_TODAY);

    expect(card(repo, 'axis-neo').outstanding).toBe(15600 - 620);
    expect(card(repo, 'axis-neo').paidSinceStatement).toBe(620);
  });

  it('leaves the other cards unchanged', () => {
    const repo = createDemoRepository();

    repo.recordPayment('axis-neo', 620, DEMO_TODAY);

    expect(card(repo, 'hdfc-millennia').outstanding).toBe(81000);
    expect(card(repo, 'sbi-simplyclick').outstanding).toBe(38400);
  });

  it('accumulates repeated payments and allows paying the exact outstanding', () => {
    const repo = createDemoRepository();

    repo.recordPayment('axis-neo', 620, DEMO_TODAY);
    repo.recordPayment('axis-neo', 14980, DEMO_TODAY);

    expect(card(repo, 'axis-neo').outstanding).toBe(0);
    expect(card(repo, 'axis-neo').paidSinceStatement).toBe(15600);
  });

  it('returns and lists the recorded payment', () => {
    const repo = createDemoRepository();

    const payment = repo.recordPayment('axis-neo', 620, DEMO_TODAY);

    expect(payment).toMatchObject({ cardId: 'axis-neo', amount: 620, date: DEMO_TODAY });
    expect(repo.listPayments()).toEqual([payment]);
  });

  it.each([
    ['unknown card', 'nope', 100, 'unknown_card'],
    ['zero amount', 'axis-neo', 0, 'invalid_amount'],
    ['negative amount', 'axis-neo', -5, 'invalid_amount'],
    ['fractional amount', 'axis-neo', 10.5, 'invalid_amount'],
    ['NaN amount', 'axis-neo', Number.NaN, 'invalid_amount'],
    ['amount above outstanding', 'axis-neo', 15601, 'amount_exceeds_outstanding'],
  ])('rejects %s and changes nothing', (_label, cardId, amount, code) => {
    const repo = createDemoRepository();

    const error = thrownBy(() => repo.recordPayment(cardId, amount, DEMO_TODAY));

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).code).toBe(code);
    expect(card(repo, 'axis-neo').outstanding).toBe(15600);
    expect(repo.listPayments()).toEqual([]);
  });

  it('rejects a date that is not an ISO calendar date', () => {
    const repo = createDemoRepository();

    for (const date of ['21/10/2026', '2026-02-30']) {
      const error = thrownBy(() => repo.recordPayment('axis-neo', 620, date));

      expect(error).toBeInstanceOf(RepositoryError);
      expect((error as RepositoryError).code).toBe('invalid_date');
    }
  });
});

describe('reset', () => {
  it('restores the seed and clears payments', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 620, DEMO_TODAY);

    repo.reset();

    expect(card(repo, 'axis-neo').outstanding).toBe(15600);
    expect(card(repo, 'axis-neo').paidSinceStatement).toBe(0);
    expect(repo.listPayments()).toEqual([]);
  });

  it('does not leak state between repository instances', () => {
    const first = createDemoRepository();
    first.recordPayment('axis-neo', 620, DEMO_TODAY);

    expect(card(createDemoRepository(), 'axis-neo').outstanding).toBe(15600);
  });
});

describe('isolation', () => {
  it('returns copies so callers cannot mutate repository state', () => {
    const repo = createDemoRepository();

    const cards = repo.listCards();
    cards[0]!.outstanding = 1;
    repo.getRules().thresholdPct = 99;
    repo.getProfile().history.anchorScore = 1;

    expect(card(repo, 'hdfc-millennia').outstanding).toBe(81000);
    expect(repo.getRules().thresholdPct).toBe(30);
    expect(repo.getProfile().history.anchorScore).toBe(724);
  });
});

describe('subscribe', () => {
  it('notifies on recordPayment and reset until unsubscribed', () => {
    const repo = createDemoRepository();
    const listener = jest.fn();
    const unsubscribe = repo.subscribe(listener);

    repo.recordPayment('axis-neo', 620, DEMO_TODAY);
    repo.reset();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    repo.recordPayment('axis-neo', 620, DEMO_TODAY);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify when a payment is rejected', () => {
    const repo = createDemoRepository();
    const listener = jest.fn();
    repo.subscribe(listener);

    expect(() => repo.recordPayment('axis-neo', 0, DEMO_TODAY)).toThrow();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('getVersion', () => {
  it('starts at 0 and increments on each successful change only', () => {
    const repo = createDemoRepository();
    expect(repo.getVersion()).toBe(0);

    repo.recordPayment('axis-neo', 620, DEMO_TODAY);
    expect(repo.getVersion()).toBe(1);

    expect(() => repo.recordPayment('axis-neo', 0, DEMO_TODAY)).toThrow();
    expect(repo.getVersion()).toBe(1);

    repo.reset();
    expect(repo.getVersion()).toBe(2);
  });
});
