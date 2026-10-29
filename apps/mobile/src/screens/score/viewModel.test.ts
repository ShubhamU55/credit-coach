import {
  DEFAULT_GUARD_CONFIG,
  predictScore,
  runWhatIf,
  type WhatIfOutcome,
  type WhatIfScenario,
} from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { toPredictorInput, toWhatIfContext } from './adapter';
import {
  WHAT_IF_TILES,
  amountProblem,
  buildScenario,
  checkedAgo,
  daysSince,
  scenarioTitle,
  describeOutcome,
  MAX_AMOUNT,
  followPlanPayments,
  reasonRows,
  scoreHeadline,
  zoneSpecs,
} from './viewModel';

function aarav() {
  const repository = createDemoRepository();
  const profile = repository.getProfile();
  const cards = repository.listCards();
  return {
    profile,
    cards,
    rules: repository.getRules(),
    context: toWhatIfContext(profile, cards, DEMO_TODAY),
  };
}

function outcomeOf(scenario: WhatIfScenario): WhatIfOutcome {
  const result = runWhatIf(aarav().context, scenario);
  if (!result.ok) throw new Error(`what-if failed: ${result.error}`);
  return result;
}

describe('WHAT_IF_TILES', () => {
  it('lists the six design tiles in order with follow-plan suggested', () => {
    expect(WHAT_IF_TILES.map((t) => t.label)).toEqual([
      'Follow this month’s plan',
      'Pay an amount on a card',
      'Miss a payment',
      'Close a card',
      'Apply for a card or loan',
      'Open an FD-backed card',
    ]);
    expect(WHAT_IF_TILES.filter((t) => t.isSuggested).map((t) => t.key)).toEqual(['follow-plan']);
  });
});

describe('zoneSpecs', () => {
  it('draws the zones from the engine config, ending at 900', () => {
    expect(zoneSpecs()).toEqual([
      { name: 'Poor', from: 300, to: 549 },
      { name: 'Fair', from: 550, to: 649 },
      { name: 'Good', from: 650, to: 749 },
      { name: 'Excellent', from: 750, to: 900 },
    ]);
  });
});

describe('reasonRows', () => {
  it('words the Aarav reasons with their direction', () => {
    const { profile, cards } = aarav();
    const estimate = predictScore(toPredictorInput(profile, cards, DEMO_TODAY));

    const rows = reasonRows(estimate.reasons);

    expect(rows.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Highest card at 81.0%', 'Overall utilization 45.0%']),
    );
    expect(rows.find((r) => r.title === 'Highest card at 81.0%')?.direction).toBe('lowers');
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it('drops reasons that do not move the score', () => {
    const rows = reasonRows([
      { factor: 'openAccounts', direction: 'flat', current: { count: 3 } },
      { factor: 'creditAge', direction: 'up', current: { oldestAccountMonths: 74 } },
    ]);

    expect(rows).toEqual([
      { key: 'creditAge', title: 'Oldest account 6 yrs 2 mo', direction: 'improves' },
    ]);
  });

  it('shows the before and after values for a what-if reason', () => {
    const rows = reasonRows(outcomeOf({ kind: 'close-card', cardId: 'hdfc-millennia' }).reasons);

    expect(rows.some((r) => r.title.includes('→'))).toBe(true);
  });
});

describe('buildScenario', () => {
  const { cards, rules } = aarav();
  const base = { cards, rules, today: DEMO_TODAY, cash: 120000 };

  it('builds pay-card from a card and an amount', () => {
    expect(buildScenario('pay-card', { cardId: 'axis-neo', amount: 5000 }, base)).toEqual({
      kind: 'pay-card',
      cardId: 'axis-neo',
      amount: 5000,
    });
  });

  it('refuses pay-card without a card or a positive whole amount', () => {
    expect(buildScenario('pay-card', { amount: 5000 }, base)).toBeNull();
    expect(buildScenario('pay-card', { cardId: 'axis-neo', amount: 0 }, base)).toBeNull();
    expect(buildScenario('pay-card', { cardId: 'axis-neo', amount: 10.5 }, base)).toBeNull();
  });

  it('builds close-card, miss-payment, apply and fd-card', () => {
    expect(buildScenario('close-card', { cardId: 'hdfc-millennia' }, base)).toEqual({
      kind: 'close-card',
      cardId: 'hdfc-millennia',
    });
    expect(buildScenario('close-card', {}, base)).toBeNull();
    expect(buildScenario('miss-payment', {}, base)).toEqual({ kind: 'miss-payment' });
    expect(buildScenario('apply', {}, base)).toEqual({ kind: 'apply', product: 'card' });
    expect(buildScenario('fd-card', { amount: 50000 }, base)).toEqual({
      kind: 'fd-card',
      fdAmount: 50000,
    });
    expect(buildScenario('fd-card', {}, base)).toBeNull();
  });

  it('builds follow-plan from the planner payments', () => {
    const scenario = buildScenario('follow-plan', {}, base);

    expect(scenario?.kind).toBe('follow-plan');
    expect(followPlanPayments(base).length).toBeGreaterThan(0);
  });
});

describe('followPlanPayments', () => {
  it('adds up the plan steps per card', () => {
    const { cards, rules } = aarav();

    const payments = followPlanPayments({ cards, rules, today: DEMO_TODAY, cash: 120000 });

    const axis = payments.find((p) => p.cardId === 'axis-neo');
    expect(axis?.amount).toBe(12400);
    expect(new Set(payments.map((p) => p.cardId)).size).toBe(payments.length);
  });
});

describe('describeOutcome', () => {
  it('close HDFC Millennia lowers the score and warns about the oldest account and the limit', () => {
    const view = describeOutcome(outcomeOf({ kind: 'close-card', cardId: 'hdfc-millennia' }));

    expect(view.beforeRange).toBe('708–736');
    expect(view.afterRange).toBe('698–726');
    expect(view.direction).toBe('lowers');
    expect(view.variant).toBe('closeCard');
    expect(view.oldestAccountLine).toContain('oldest account');
    expect(view.limitLine).toContain('₹1,00,000');
    expect(view.utilizationLines.overall).toContain('→');
  });

  it('following the plan improves the score', () => {
    const { cards, rules } = aarav();
    const payments = followPlanPayments({ cards, rules, today: DEMO_TODAY, cash: 120000 });

    const view = describeOutcome(outcomeOf({ kind: 'follow-plan', payments }));

    expect(view.direction).toBe('improves');
    expect(view.variant).toBe('standard');
    expect(view.oldestAccountLine).toBeNull();
  });

  it('calls a very small move "barely moves"', () => {
    const view = describeOutcome(outcomeOf({ kind: 'pay-card', cardId: 'axis-neo', amount: 1 }));

    expect(view.direction).toBe('barely moves');
  });

  it('an application carries the guard impact as a range of points, not a score', () => {
    const view = describeOutcome(outcomeOf({ kind: 'apply', product: 'card' }));

    expect(view.guard?.hasWarning).toBe(false);
    expect(view.guard?.impactLine).toMatch(
      /^Another application could cost about \d+–\d+ points\.$/,
    );
  });

  it('warns once hard inquiries reach the configured N', () => {
    const { context } = aarav();
    const busy = {
      ...context,
      input: {
        ...context.input,
        hardInquiries6m: DEFAULT_GUARD_CONFIG.minHardInquiries6m,
        hardInquiries12m: 3,
      },
    };
    const result = runWhatIf(busy, { kind: 'apply', product: 'loan' });
    if (!result.ok) throw new Error('what-if failed');

    const view = describeOutcome(result);

    expect(view.guard?.hasWarning).toBe(true);
    expect(view.guard?.headline).toBe('You already have 2 hard inquiries in the last 6 months.');
  });

  it('has no guard for scenarios that are not applications', () => {
    expect(describeOutcome(outcomeOf({ kind: 'miss-payment' })).guard).toBeNull();
  });

  it('never produces a single-number score', () => {
    const view = describeOutcome(outcomeOf({ kind: 'miss-payment' }));

    expect(view.afterRange).toMatch(/^\d{3}–\d{3}$/);
    expect(view.beforeRange).toMatch(/^\d{3}–\d{3}$/);
  });
});

describe('scoreHeadline', () => {
  it('names the zone and the plan when the plan helps', () => {
    expect(scoreHeadline('Good', true)).toEqual({
      before: 'You’re in ',
      zone: 'good',
      after: ' shape — and the plan helps.',
    });
  });

  it('drops the plan clause when the plan does not help', () => {
    expect(scoreHeadline('Excellent', false).after).toBe(' shape.');
  });
});

describe('daysSince', () => {
  it('counts calendar days from the anchor to today', () => {
    expect(daysSince('2026-10-02', '2026-10-21')).toBe(19);
    expect(daysSince('2026-10-21', '2026-10-21')).toBe(0);
  });
});

describe('checkedAgo', () => {
  it('words the age of the report', () => {
    expect(checkedAgo(19)).toBe('CHECKED 19 DAYS AGO');
    expect(checkedAgo(1)).toBe('CHECKED 1 DAY AGO');
    expect(checkedAgo(0)).toBe('CHECKED TODAY');
  });
});

describe('scenarioTitle', () => {
  const { cards } = aarav();

  it('names the action and the amount', () => {
    expect(scenarioTitle({ kind: 'close-card', cardId: 'hdfc-millennia' }, cards)).toBe(
      'you close HDFC Millennia',
    );
    expect(scenarioTitle({ kind: 'pay-card', cardId: 'axis-neo', amount: 5000 }, cards)).toBe(
      'you pay ₹5,000 on Axis Neo',
    );
    expect(scenarioTitle({ kind: 'fd-card', fdAmount: 50000 }, cards)).toBe(
      'you open an FD-backed card with ₹50,000',
    );
    expect(scenarioTitle({ kind: 'miss-payment' }, cards)).toBe('you miss a payment');
    expect(scenarioTitle({ kind: 'apply', product: 'card' }, cards)).toBe(
      'you apply for a card or loan',
    );
    expect(scenarioTitle({ kind: 'follow-plan', payments: [] }, cards)).toBe(
      'you follow this month’s plan',
    );
  });
});

describe('amountProblem and buildScenario agree', () => {
  const { cards, rules } = aarav();
  const plan = { cards, rules, today: DEMO_TODAY, cash: 120000 };
  const hdfc = cards[0];

  it('accepts a whole amount up to the outstanding for pay-card', () => {
    expect(amountProblem('pay-card', 81000, hdfc)).toBeUndefined();
  });

  it.each([
    ['decimals', 10.5],
    ['zero', 0],
    ['negative', -5],
    ['above a crore', 10000001],
    ['9e15', 9e15],
    ['beyond safe integers', 99999999999999999],
    ['NaN', Number.NaN],
  ])('rejects %s for both the message and the scenario', (_name, amount) => {
    expect(amountProblem('fd-card', amount)).toEqual(expect.any(String));
    expect(buildScenario('fd-card', { amount }, plan)).toBeNull();
    expect(amountProblem('pay-card', amount, hdfc)).toEqual(expect.any(String));
    expect(buildScenario('pay-card', { cardId: hdfc.id, amount }, plan)).toBeNull();
  });

  it('rejects more than the outstanding for pay-card, with the limit in the message', () => {
    expect(amountProblem('pay-card', 81001, hdfc)).toContain('₹81,000');
    expect(buildScenario('pay-card', { cardId: hdfc.id, amount: 81001 }, plan)).toBeNull();
  });

  it('says nothing is outstanding on a card at zero', () => {
    const paid = { ...hdfc, outstanding: 0 };

    expect(amountProblem('pay-card', 100, paid)).toBe('Nothing is outstanding on HDFC Millennia.');
    expect(
      buildScenario('pay-card', { cardId: hdfc.id, amount: 100 }, { ...plan, cards: [paid] }),
    ).toBeNull();
  });

  it('has no message while the field is empty', () => {
    expect(amountProblem('fd-card', undefined)).toBeUndefined();
  });

  it('refuses pay-card for an unknown card', () => {
    expect(buildScenario('pay-card', { cardId: 'nope', amount: 100 }, plan)).toBeNull();
    expect(buildScenario('close-card', { cardId: 'nope' }, plan)).toBeNull();
  });
});

describe('Fix round 2: boundaries', () => {
  const { cards, rules } = aarav();
  const plan = { cards, rules, today: DEMO_TODAY, cash: 120000 };
  const hdfc = cards[0];

  it('accepts exactly the largest amount for an FD card and refuses one rupee more', () => {
    expect(amountProblem('fd-card', MAX_AMOUNT)).toBeUndefined();
    expect(buildScenario('fd-card', { amount: MAX_AMOUNT }, plan)).toEqual({
      kind: 'fd-card',
      fdAmount: MAX_AMOUNT,
    });
    expect(amountProblem('fd-card', MAX_AMOUNT + 1)).toEqual(expect.any(String));
    expect(buildScenario('fd-card', { amount: MAX_AMOUNT + 1 }, plan)).toBeNull();
  });

  it('builds pay-card for exactly the outstanding amount', () => {
    expect(
      buildScenario('pay-card', { cardId: hdfc.id, amount: hdfc.outstanding }, plan),
    ).toMatchObject({ kind: 'pay-card', amount: hdfc.outstanding });
  });

  it.each([
    ['moves up by exactly 2', 2, 'barely moves'],
    ['moves up by 3', 3, 'improves'],
    ['moves down by exactly 2', -2, 'barely moves'],
    ['moves down by 3', -3, 'lowers'],
  ])('direction when the centre %s', (_name, move, expected) => {
    const base = outcomeOf({ kind: 'miss-payment' });
    const outcome = {
      ...base,
      before: { ...base.before, low: 700, high: 720 },
      after: { ...base.after, low: 700 + move, high: 720 + move },
    };

    expect(describeOutcome(outcome).direction).toBe(expected);
  });

  it('keeps what-if ranges inside 300 to 900', () => {
    const base = outcomeOf({ kind: 'miss-payment' });
    const low = describeOutcome({
      ...base,
      before: { ...base.before, low: 300, high: 330 },
      after: { ...base.after, low: 280, high: 310 },
    });
    const high = describeOutcome({
      ...base,
      before: { ...base.before, low: 870, high: 900 },
      after: { ...base.after, low: 890, high: 930 },
    });

    for (const text of [low.beforeRange, low.afterRange, high.beforeRange, high.afterRange]) {
      const [from, to] = text.split('–').map(Number) as [number, number];
      expect(from).toBeGreaterThanOrEqual(300);
      expect(to).toBeLessThanOrEqual(900);
    }
  });

  it('counts days across month-end, year-end and a leap day', () => {
    expect(daysSince('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysSince('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysSince('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysSince('2027-02-28', '2027-03-01')).toBe(1);
  });

  it('says "this card" when the card is not in the list', () => {
    expect(scenarioTitle({ kind: 'close-card', cardId: 'gone' }, cards)).toBe(
      'you close this card',
    );
    expect(scenarioTitle({ kind: 'pay-card', cardId: 'gone', amount: 100 }, cards)).toBe(
      'you pay ₹100 on this card',
    );
  });
});
