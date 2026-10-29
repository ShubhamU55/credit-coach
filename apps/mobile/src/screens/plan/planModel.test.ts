import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import aaravSeed from '../../demo/aarav.json';
import { parseSeed } from '../../demo/seed';
import type { DemoCard } from '../../demo/types';
import { MAX_CASH, applyCashEdit, buildPlanView, compareSteps, parseCash } from './planModel';

function view(repo = createDemoRepository(), aimFor10 = false, cash?: number) {
  return buildPlanView({
    cards: repo.listCards(),
    payments: repo.listPayments(),
    rules: repo.getRules(),
    cash: cash ?? repo.getProfile().cashForCards,
    today: DEMO_TODAY,
    aimFor10,
  });
}

const row = (v: ReturnType<typeof view>) =>
  v.steps.map((s) => [s.step, s.cardId, s.fullAmount, s.payBy, s.before, s.after]);

describe('buildPlanView golden (design.md section 8)', () => {
  it('matches the 30% target table for Aarav', () => {
    const v = view();
    expect(row(v)).toEqual([
      [1, 'axis-neo', 620, '2026-10-22', 19.5, 18.7],
      [2, 'hdfc-millennia', 3710, '2026-11-04', 81, 77.3],
      [3, 'axis-neo', 11780, '2026-10-22', 18.7, 4],
      [4, 'hdfc-millennia', 70490, '2026-11-04', 77.3, 6.8],
      [5, 'sbi-simplyclick', 2400, '2026-10-24', 32, 30],
    ]);
    expect(v.utilizationAfter).toBe('15.3%');
    expect(v.highestAfter).toBe('30.0%');
    expect(v.leftover).toBe(31000);
    expect(v.periodLabel).toBe('21 OCT → 20 NOV');
  });

  it('matches the 10% switch table, step 05 becomes 26,400', () => {
    const v = view(createDemoRepository(), true);
    expect(v.steps[4]).toMatchObject({ fullAmount: 26400, after: 10 });
    expect(v.utilizationAfter).toBe('7.3%');
    expect(v.highestAfter).toBe('10.0%');
    expect(v.leftover).toBe(7000);
  });

  it('reproduces the admin demo moment: threshold 20, switch off gives SBI 14,400', () => {
    const seed = parseSeed(aaravSeed);
    const repo = createDemoRepository({ ...seed, rules: { ...seed.rules, thresholdPct: 20 } });
    const v = view(repo);
    expect(v.steps[4]).toMatchObject({ cardId: 'sbi-simplyclick', fullAmount: 14400, after: 20 });
    expect(v.leftover).toBe(19000);
  });

  it('marks the earliest unpaid step primary and the rest secondary', () => {
    const v = view();
    expect(v.steps.map((s) => s.state)).toEqual([
      'primary',
      'secondary',
      'secondary',
      'secondary',
      'secondary',
    ]);
    expect(v.steps[0].payByLabel).toBe('BY TOMORROW');
    expect(v.steps[0].isSoon).toBe(true);
    expect(v.steps[1].isSoon).toBe(false);
  });
});

describe('buildPlanView after payments', () => {
  it('keeps paid steps in the list, collapsed, and moves primary on', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 12400, DEMO_TODAY);
    const v = view(repo);
    expect(v.steps.map((s) => s.state)).toEqual([
      'paid',
      'secondary',
      'paid',
      'secondary',
      'primary',
    ]);
    expect(v.steps[0].paidLabel).toBe('21 OCT');
    expect(v.steps[2].fullAmount).toBe(11780);
  });

  it('marking only step 01 paid leaves step 03 as the next primary', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 620, DEMO_TODAY);
    const v = view(repo);
    expect(v.steps[0].state).toBe('paid');
    expect(v.steps[2].state).toBe('primary');
  });

  it('shows what is left of a partly paid step', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 5620, DEMO_TODAY);
    const v = view(repo);
    expect(v.steps[0].state).toBe('paid');
    expect(v.steps[2]).toMatchObject({ amount: 6780, fullAmount: 11780, state: 'primary' });
  });
});

describe('buildPlanView timeline and shortfalls', () => {
  it('draws no Due marker for SBI and sums same-day payments per lane', () => {
    const v = view();
    const sbi = v.lanes.find((l) => l.cardName === 'SBI SimplyClick');
    const axis = v.lanes.find((l) => l.cardName === 'Axis Neo');
    expect(sbi?.due).toBeUndefined();
    expect(sbi?.statement).toBe('2026-10-25');
    expect(axis?.payBy).toEqual({ iso: '2026-10-22', label: '₹12,400 · 22 Oct' });
    expect(axis?.due).toBe('2026-10-22');
    expect(v.timelineLabel).toContain('Axis Neo');
    expect(v.timelineLabel).not.toContain('14 November');
  });

  it('puts each lane payBy at the earliest open step date, chronologically', () => {
    const v = view();
    const iso = (name: string) => v.lanes.find((l) => l.cardName === name)?.payBy?.iso;
    expect(iso('Axis Neo')).toBe('2026-10-22');
    expect(iso('SBI SimplyClick')).toBe('2026-10-24');
    expect(iso('HDFC Millennia')).toBe('2026-11-04');
  });

  it('shows a shortfall instead of hiding it', () => {
    const v = view(createDemoRepository(), false, 1000);
    expect(v.shortfalls.length).toBeGreaterThan(0);
    expect(v.shortfalls[0].text).toMatch(/short/);
    expect(v.summary).toMatch(/\S/);
  });
});

describe('buildPlanView leftover and payments on cards with no plan items', () => {
  it('lowers leftover by a payment on a card the plan does not touch', () => {
    const seed = parseSeed(aaravSeed);
    const repo = createDemoRepository({ ...seed, rules: { ...seed.rules, thresholdPct: 40 } });
    const baseline = view(repo);
    expect(baseline.steps.some((s) => s.cardId === 'sbi-simplyclick')).toBe(false);

    repo.recordPayment('sbi-simplyclick', 5000, DEMO_TODAY);

    expect(view(repo).leftover).toBe(baseline.leftover - 5000);
  });
});
describe('buildPlanView due-date edges', () => {
  function axisSteps(dueDay: number, statementDay: number, today = DEMO_TODAY) {
    const seed = parseSeed(aaravSeed);
    const cards: DemoCard[] = seed.cards.map((c) =>
      c.id === 'axis-neo' ? { ...c, dueDay, statementDay } : c,
    );
    const repo = createDemoRepository({ ...seed, cards });
    const v = buildPlanView({
      cards: repo.listCards(),
      payments: [],
      rules: repo.getRules(),
      cash: 120000,
      today,
      aimFor10: false,
    });
    return v.steps.filter((s) => s.cardId === 'axis-neo');
  }

  it('flags a pay-by that is today as BY TODAY and soon', () => {
    const steps = axisSteps(21, 2);
    expect(steps.map((s) => s.payBy)).toEqual(['2026-10-21', '2026-10-21']);
    expect(steps[0]).toMatchObject({ payByLabel: 'BY TODAY', isSoon: true });
  });

  it('keeps an overdue due date as the pay-by, labelled and soon', () => {
    const steps = axisSteps(15, 2);
    expect(steps[0].payBy <= DEMO_TODAY).toBe(true);
    expect(steps[0].isSoon).toBe(true);
    expect(steps[0].payByLabel).toMatch(/^BY /);
  });

  it('clamps a 31st due day to the last day of a short month', () => {
    const steps = axisSteps(31, 2, '2026-02-20');
    expect(steps[0].payBy).toBe('2026-02-28');
  });

  it('orders steps by pay-by date and then step number', () => {
    const steps = axisSteps(21, 2);
    expect(compareSteps(steps[0], steps[1])).toBeLessThan(0);
    expect(compareSteps(steps[1], steps[0])).toBeGreaterThan(0);
    expect(compareSteps(steps[0], steps[0])).toBe(0);
  });
});

describe('cash helpers', () => {
  it('parses empty text as zero', () => {
    expect(parseCash('')).toBe(0);
    expect(parseCash('120000')).toBe(120000);
  });
  it('adds what is recorded back, and refuses a total above the limit', () => {
    expect(applyCashEdit('5000', 620)).toEqual({ cashText: '5620' });
    expect(applyCashEdit('', 0)).toEqual({ cashText: '0' });
    expect(applyCashEdit(String(MAX_CASH), 0)).toEqual({
      cashText: String(MAX_CASH),
    });
    expect(applyCashEdit(String(MAX_CASH), 1)).toEqual({
      error: 'Enter ₹99,99,99,999 or less.',
    });
  });
});
