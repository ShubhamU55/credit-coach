import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { buildHomeModel, initialsOf, toEngineCards } from './adapter';

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
      minimumLine: '₹620 of it is your minimum.',
    });
    expect(hero?.clearsStatement).toBe(true);
  });

  it('shows the next two steps other than the hero under Coming up', () => {
    const model = aaravModel();

    expect(model.comingUp.map((i) => [i.title, i.amount, i.date, i.month])).toEqual([
      ['HDFC Millennia', '₹3,710', '4', 'Nov'],
      ['HDFC Millennia', '₹70,490', '4', 'Nov'],
    ]);
    expect(model.comingUp[0].reason).toBe('Pay the minimum · 81.0% → 77.3%');
    expect(model.stepsTotal).toBe(5);
    expect(model.stepsDone).toBe(0);
  });

  it('gives a score range with and without the plan, never one number', () => {
    const { score } = aaravModel();

    expect(score.range).toBe('708–736');
    expect(score.withPlanRange).toBe('724–752');
    expect(score.band).toBe('Good');
  });

  it('counts a recorded payment as a done step and keeps the plan recomputed', () => {
    const model = aaravModel((repository) => repository.recordPayment('axis-neo', 620, DEMO_TODAY));

    expect(model.stepsDone).toBe(1);
    expect(model.hero?.cardName).toBe('Axis Neo');
  });

  it('has no hero once every card is cleared', () => {
    const model = aaravModel((repository) => {
      repository.listCards().forEach((card) => {
        if (card.outstanding > 0) repository.recordPayment(card.id, card.outstanding, DEMO_TODAY);
      });
    });

    expect(model.hero).toBeNull();
    expect(model.comingUp).toEqual([]);
  });
});

describe('cards without a usable limit (PRD 5.2)', () => {
  it('excludes a limit-0 card from utilization and flags it', () => {
    const repository = createDemoRepository();
    const cards = repository.listCards().map((c) => (c.id === 'sbi-simplyclick' ? { ...c, limit: 0 } : c));

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

describe('initialsOf', () => {
  it('takes the first letters of the first two words and ignores the sample tag', () => {
    expect(initialsOf('Aarav Mehta (sample)')).toBe('AM');
    expect(initialsOf('Priya')).toBe('P');
  });
});
