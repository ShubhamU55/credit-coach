import { formatScoreRange, predictScore } from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import {
  toPlannerCards,
  toPlannerRules,
  toPredictorInput,
  toWhatIfCards,
  toWhatIfContext,
} from './adapter';

function aarav() {
  const repository = createDemoRepository();
  return {
    profile: repository.getProfile(),
    cards: repository.listCards(),
    rules: repository.getRules(),
  };
}

describe('toPredictorInput', () => {
  it('turns the Aarav data into predictor primitives', () => {
    const { profile, cards } = aarav();

    const input = toPredictorInput(profile, cards, DEMO_TODAY);

    expect(input).toMatchObject({
      today: '2026-10-21',
      anchor: { score: 724, date: '2026-10-02' },
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
    });
  });

  it('predicts the golden 708-736 Good range', () => {
    const { profile, cards } = aarav();

    const estimate = predictScore(toPredictorInput(profile, cards, DEMO_TODAY));

    expect(formatScoreRange(estimate.low, estimate.high)).toBe('708–736');
    expect(estimate.band).toBe('Good');
  });

  it('excludes a card with no limit from utilization instead of dividing by zero', () => {
    const { profile, cards } = aarav();
    const noLimit = cards.map((c) => (c.id === 'axis-neo' ? { ...c, limit: 0 } : c));

    const input = toPredictorInput(profile, noLimit, DEMO_TODAY);

    expect(input.overallUtilizationPct).toBe(54.3);
    expect(input.maxCardUtilizationPct).toBe(81);
  });

  it('uses 0 utilization when no card has a limit', () => {
    const { profile, cards } = aarav();

    const input = toPredictorInput(
      profile,
      cards.map((c) => ({ ...c, limit: 0 })),
      DEMO_TODAY,
    );

    expect(input.overallUtilizationPct).toBe(0);
    expect(input.maxCardUtilizationPct).toBe(0);
  });
});

describe('what-if and planner adapters', () => {
  it('keeps id, limit, outstanding, age and secured flag for each card', () => {
    const { cards } = aarav();

    expect(toWhatIfCards(cards)[0]).toEqual({
      id: 'hdfc-millennia',
      limit: 100000,
      outstanding: 81000,
      ageMonths: 74,
      isSecured: false,
    });
  });

  it('builds a context whose input and cards describe the same state', () => {
    const { profile, cards } = aarav();

    const context = toWhatIfContext(profile, cards, DEMO_TODAY);

    expect(context.cards).toHaveLength(3);
    expect(context.input.overallUtilizationPct).toBe(45);
  });

  it('gives the planner a numeric due day for a card with nothing due', () => {
    const { cards } = aarav();

    const sbi = toPlannerCards(cards).find((c) => c.id === 'sbi-simplyclick');

    expect(Number.isInteger(sbi?.dueDay)).toBe(true);
  });

  it('maps the demo rules onto the engine rules', () => {
    const { rules } = aarav();

    expect(toPlannerRules(rules)).toMatchObject({ thresholdPct: 30, aimFor10: false });
  });
});
