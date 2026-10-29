import {
  formatINR,
  formatScoreRange,
  formatShortDate,
  planPayments,
  predictScore,
} from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import {
  NOTHING_TO_PAY_TEXT,
  NO_CARDS_TEXT,
  buildHero,
  buildHomeModel,
  dateParts,
  initialsOf,
  scalePercent,
  toEngineCards,
  toEngineRules,
} from './adapter';

function aaravModel(mutate?: (repository: ReturnType<typeof createDemoRepository>) => void) {
  const repository = createDemoRepository();
  mutate?.(repository);
  return buildHomeModel({
    profile: repository.getProfile(),
    cards: repository.listCards(),
    rules: repository.getRules(),
    payments: repository.listPayments(),
    today: DEMO_TODAY,
  });
}

describe('buildHomeModel with the Aarav sample profile', () => {
  it('reports overall utilization 45.0% and the totals', () => {
    const model = aaravModel();

    expect(model.overall).toEqual({ pct: 45, outstanding: 135000, limit: 300000 });
    expect(model.overallAfter).toBe(15.3);
  });

  it('lists three card tiles with their utilization and due dates', () => {
    const model = aaravModel();

    expect(model.cards.map((c) => [c.name, c.utilPercent])).toEqual([
      ['HDFC Millennia', 81],
      ['SBI SimplyClick', 32],
      ['Axis Neo', 19.5],
    ]);
    expect(model.cards[0].line).toBe('₹81,000 / ₹1,00,000 · due 4 Nov · statement 15 Nov');
    expect(model.cards[1].line).toBe('₹38,400 / ₹1,20,000 · nothing due · statement 25 Oct');
    expect(model.cards[2].line).toBe('₹15,600 / ₹80,000 · due 22 Oct · statement 2 Nov');
    expect(new Set(model.cards.map((c) => c.finish)).size).toBe(3);
  });

  it('makes the hero the Axis Neo statement, with the minimum named', () => {
    const { hero } = aaravModel();

    expect(hero).toMatchObject({
      cardName: 'Axis Neo',
      finish: 'plum',
      dueChip: 'BY THU, 22 OCT',
      amount: '₹12,400',
      dateText: 'Thu, 22 Oct',
      middleText: ' — clears your full statement, so ',
      emphasisText: 'zero interest.',
      minimumLine: '₹620 of it is your minimum.',
    });
    expect(hero?.isStatementCleared).toBe(true);
  });

  it('shows the next two steps other than the hero under Coming up', () => {
    const model = aaravModel();

    expect(model.comingUp.map((i) => [i.title, i.amount, i.date, i.month])).toEqual([
      ['HDFC Millennia', '₹3,710', '4', 'Nov'],
      ['HDFC Millennia', '₹70,490', '4', 'Nov'],
    ]);
    expect(model.comingUp[0].reason).toBe('Pay the minimum · 81.0% → 77.3%');
    expect(model.planItemCount).toBe(5);
    expect(model.stepsTotal).toBe(3);
    expect(model.stepsDone).toBe(0);
  });

  it('gives a score range with and without the plan, never one number', () => {
    const { score } = aaravModel();
    if (!score) throw new Error('expected a score');

    expect(score.range).toBe('708–736');
    expect(score.withPlanRange).toBe('724–752');
    expect(score.barPercent).toBe(70.3);
    expect(score.targetPercent).toBe(73);
    expect(score.band).toBe('Good');
  });

  it('does not count a minimum-only payment as a done step while the hero still asks for more', () => {
    const model = aaravModel((repository) => repository.recordPayment('axis-neo', 620, DEMO_TODAY));

    expect(model.stepsDone).toBe(0);
    expect(model.stepsTotal).toBe(3);
    expect(model.hero?.amount).toBe('₹11,780');
    expect(model.hero?.cardName).toBe('Axis Neo');
  });

  it('counts a card as one done step once its whole payment is made', () => {
    const model = aaravModel((repository) =>
      repository.recordPayment('axis-neo', 12400, DEMO_TODAY),
    );

    expect(model.stepsDone).toBe(1);
    expect(model.stepsTotal).toBe(3);
    expect(model.hero?.cardName).toBe('SBI SimplyClick');
  });

  it('has no hero once every card is cleared', () => {
    const model = aaravModel((repository) => {
      repository.listCards().forEach((card) => {
        if (card.outstanding > 0) repository.recordPayment(card.id, card.outstanding, DEMO_TODAY);
      });
    });

    expect(model.hero).toBeNull();
    expect(model.comingUp).toEqual([]);
    expect(model.nothingToDo).toBe(NOTHING_TO_PAY_TEXT);
    expect(model.nothingToDo).not.toMatch(/cash|left over|leftover/i);
  });
});

describe('cards without a usable limit (PRD 5.2)', () => {
  it('excludes a limit-0 card from utilization and flags it', () => {
    const repository = createDemoRepository();
    const cards = repository
      .listCards()
      .map((c) => (c.id === 'sbi-simplyclick' ? { ...c, limit: 0 } : c));

    const model = buildHomeModel({
      profile: repository.getProfile(),
      cards,
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });

    expect(model.excluded.map((c) => c.name)).toEqual(['SBI SimplyClick']);
    expect(model.cards.map((c) => c.name)).toEqual(['HDFC Millennia', 'Axis Neo']);
    expect(model.overall?.limit).toBe(180000);
  });

  it('treats a missing limit as excluded too', () => {
    const [card] = createDemoRepository().listCards();
    const broken = { ...card, limit: undefined } as unknown as typeof card;

    expect(toEngineCards([broken])[0].limit).toBe(0);
  });
});

function payOff(repository: ReturnType<typeof createDemoRepository>, ids: string[]) {
  repository.listCards().forEach((card) => {
    if (ids.includes(card.id)) repository.recordPayment(card.id, card.outstanding, DEMO_TODAY);
  });
}

describe.each(['statement', 'weekly_current'] as const)(
  'a prepay-first hero is one payment under %s (F6)',
  (reportingBasis) => {
    it('takes date, amount and sentence from the prepay alone, with no minimum claimed', () => {
      const repository = createDemoRepository();
      payOff(repository, ['axis-neo', 'hdfc-millennia']);
      const rules = { ...repository.getRules(), reportingBasis };
      const cards = repository.listCards();
      const profile = repository.getProfile();
      const plan = planPayments({
        cards: toEngineCards(cards),
        cash: profile.cashForCards,
        today: DEMO_TODAY,
        rules: toEngineRules(rules),
      });
      const model = buildHomeModel({ profile, cards, rules, payments: [], today: DEMO_TODAY });
      const [item] = plan.items;

      expect(plan.items).toHaveLength(1);
      expect(item.kind).toBe('prepay');
      expect(model.hero).toEqual({
        cardId: 'sbi-simplyclick',
        cardName: 'SBI SimplyClick',
        finish: 'navy',
        dueChip: `BY ${formatShortDate(item.payBy).toUpperCase()}`,
        dateText: formatShortDate(item.payBy),
        isDateUnknown: false,
        middleText: ` — ${item.reason.text}`,
        emphasisText: '',
        amount: formatINR(item.amount),
        isStatementCleared: false,
        minimumLine: 'No minimum is due on this payment.',
      });
    });
  },
);

describe('the hero under weekly_current with the Aarav plan (F6)', () => {
  it('uses the earliest pay-by date and only that card and date for the amount', () => {
    const repository = createDemoRepository();
    const rules = { ...repository.getRules(), reportingBasis: 'weekly_current' as const };

    const model = buildHomeModel({
      profile: repository.getProfile(),
      cards: repository.listCards(),
      rules,
      payments: [],
      today: DEMO_TODAY,
    });

    expect(model.hero?.cardId).toBe('axis-neo');
    expect(model.hero?.dueChip).toBe('BY THU, 22 OCT');
    expect(model.hero?.amount).toBe('₹12,400');
    expect(model.hero?.isStatementCleared).toBe(true);
  });
});

describe('utilization tile and score edges', () => {
  it('has no "after plan" delta when the plan does not lower utilization', () => {
    const repository = createDemoRepository();
    const profile = { ...repository.getProfile(), cashForCards: 100 };

    const model = buildHomeModel({
      profile,
      cards: repository.listCards(),
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });

    expect(model.overallAfter).toBe(45);
    expect(model.utilTile.delta).toBeUndefined();
    expect(model.utilTile.value).toBe('45.0%');
    expect(model.utilTile.isOver).toBe(true);
    expect(model.utilTile.caption).toBe('₹1,35,000 of ₹3,00,000 · target 30%');
  });

  it('has no with-plan range when cards exist but the plan is empty', () => {
    const model = aaravModel((repository) =>
      payOff(repository, ['axis-neo', 'hdfc-millennia', 'sbi-simplyclick']),
    );

    expect(model.hasCards).toBe(true);
    expect(model.score?.withPlanRange).toBeNull();
    expect(model.utilTile.delta).toBeUndefined();
  });

  it('clamps the scale position to 0 and 100', () => {
    expect(scalePercent(300, 300)).toBe(0);
    expect(scalePercent(100, 200)).toBe(0);
    expect(scalePercent(900, 900)).toBe(100);
    expect(scalePercent(950, 990)).toBe(100);
  });

  it.each([300, 900])('names the zone the engine gives for an anchor of %s', (anchorScore) => {
    const repository = createDemoRepository();
    const profile = repository.getProfile();
    profile.history.anchorScore = anchorScore;
    const history = profile.history;

    const model = buildHomeModel({
      profile,
      cards: repository.listCards(),
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });
    const expected = predictScore({
      anchor: { score: anchorScore, date: history.anchorDate },
      today: DEMO_TODAY,
      onTimePayments: history.monthsWithZeroMissed,
      missedPayments: history.missedPayments,
      overallUtilizationPct: 45,
      maxCardUtilizationPct: 81,
      hardInquiries6m: history.hardInquiries6m,
      hardInquiries12m: history.hardInquiries12m,
      oldestAccountMonths: history.oldestAccountMonths,
      openAccounts: 3,
      securedAccounts: history.securedAccounts,
      unsecuredAccounts: history.unsecuredAccounts,
    });

    expect(model.score?.band).toBe(expected.band);
    expect(model.score?.band).not.toBe('Good');
    expect(model.score?.range).toBe(formatScoreRange(expected.low, expected.high));
  });
});

describe('cards with an unknown due date (F1)', () => {
  it('shows "due date unknown" and invents no date when dueDay is null but a balance is owed', () => {
    const repository = createDemoRepository();
    const cards = repository
      .listCards()
      .map((c) => (c.id === 'hdfc-millennia' ? { ...c, dueDay: null } : c));

    const model = buildHomeModel({
      profile: repository.getProfile(),
      cards,
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });

    expect(model.cards[0].line).toBe('₹81,000 / ₹1,00,000 · due date unknown · statement 15 Nov');
  });
});

describe('a card with no due day never gets an invented date (F1)', () => {
  function withNullDue(...ids: string[]) {
    const repository = createDemoRepository();
    const cards = repository
      .listCards()
      .map((c) => (ids.includes(c.id) ? { ...c, dueDay: null } : c));
    return buildHomeModel({
      profile: repository.getProfile(),
      cards,
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });
  }

  it('says the due date is unknown in the hero when that card is the next payment', () => {
    const model = withNullDue('axis-neo');

    expect(model.hero?.cardId).toBe('axis-neo');
    expect(model.hero?.dueChip).toBe('DUE DATE UNKNOWN');
    expect(model.hero?.isDateUnknown).toBe(true);
    expect(model.hero?.dateText).toBe('Due date unknown');
  });

  it('says it in Coming up too, with no date block filled in', () => {
    const model = withNullDue('axis-neo', 'hdfc-millennia');

    expect(model.comingUp).toEqual([
      {
        day: '—',
        date: '?',
        month: '—',
        title: 'HDFC Millennia',
        reason: 'Pay the minimum · due date unknown · 81.0% → 77.3%',
        amount: '₹3,710',
      },
      {
        day: '—',
        date: '?',
        month: '—',
        title: 'HDFC Millennia',
        reason: 'Clear the statement · due date unknown · 77.3% → 6.8%',
        amount: '₹70,490',
      },
    ]);
  });

  it('keeps the Aarav output unchanged: SBI has no due day and owes nothing', () => {
    const model = aaravModel();

    expect(model.planItemCount).toBe(5);
    expect(model.hero?.dueChip).toBe('BY THU, 22 OCT');
    expect(model.comingUp.every((i) => i.date !== '?')).toBe(true);
    expect(model.cards[1].line).toContain('nothing due');
  });

  it('does not mark a prepay as having an unknown date', () => {
    const model = withNullDue('sbi-simplyclick');

    expect(model.hero?.dueChip).toBe('BY THU, 22 OCT');
    expect(model.planItemCount).toBe(5);
  });
});

describe('no card with a usable limit (F2, F3)', () => {
  const emptyModel = (cards: Parameters<typeof buildHomeModel>[0]['cards']) => {
    const repository = createDemoRepository();
    return buildHomeModel({
      profile: repository.getProfile(),
      cards,
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });
  };

  it('builds no score estimate from nothing', () => {
    expect(emptyModel([]).score).toBeNull();
    const allZero = createDemoRepository()
      .listCards()
      .map((c) => ({ ...c, limit: 0 }));
    expect(emptyModel(allZero).score).toBeNull();
    expect(emptyModel(allZero).overall).toBeNull();
  });

  it('uses its own empty copy, with no cash or leftover wording', () => {
    const model = emptyModel([]);

    expect(model.hasCards).toBe(false);
    expect(model.hero).toBeNull();
    expect(model.nothingToDo).toBe(NO_CARDS_TEXT);
    expect(model.nothingToDo).not.toMatch(/cash|left over|leftover|cycle/i);
  });
});

describe('a plan item whose card is missing (never "all set")', () => {
  it('still produces a hero named by the card id', () => {
    const repository = createDemoRepository();
    const plan = planPayments({
      cards: toEngineCards(repository.listCards()),
      cash: repository.getProfile().cashForCards,
      today: DEMO_TODAY,
      rules: toEngineRules(repository.getRules()),
    });

    const result = buildHero(plan.items, [], new Map(), DEMO_TODAY, () => false);

    expect(result?.hero.cardName).toBe('axis-neo');
    expect(result?.hero.amount).toBe('₹12,400');
    expect(result?.hero.dueChip).toBe('BY THU, 22 OCT');
    expect(result?.hero.isStatementCleared).toBe(false);
  });
});

describe('a zero-limit card with a payment due', () => {
  it('may still be the hero, while utilization leaves it out', () => {
    const repository = createDemoRepository();
    const cards = repository.listCards().map((c) => (c.id === 'axis-neo' ? { ...c, limit: 0 } : c));

    const model = buildHomeModel({
      profile: repository.getProfile(),
      cards,
      rules: repository.getRules(),
      payments: [],
      today: DEMO_TODAY,
    });

    // The money is still owed, so the payment is shown; the card is not counted in utilization.
    expect(model.hero?.cardId).toBe('axis-neo');
    expect(model.excluded.map((c) => c.id)).toEqual(['axis-neo']);
    expect(model.cards.map((c) => c.id)).toEqual(['hdfc-millennia', 'sbi-simplyclick']);
    expect(model.overall).toEqual({ pct: 54.3, outstanding: 119400, limit: 220000 });
  });
});

describe('dateParts', () => {
  it('splits a short date into day name, date and month', () => {
    expect(dateParts('2026-10-22')).toEqual({ day: 'Thu', date: '22', month: 'Oct' });
    expect(dateParts('2026-11-04')).toEqual({ day: 'Wed', date: '4', month: 'Nov' });
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words and ignores the sample tag', () => {
    expect(initialsOf('Aarav Mehta (sample)')).toBe('AM');
    expect(initialsOf('Priya')).toBe('P');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('(sample)')).toBe('?');
    expect(initialsOf('𠮷田 太郎')).toBe('𠮷太');
  });
});
