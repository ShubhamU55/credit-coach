import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import aaravSeed from '../../demo/aarav.json';
import { parseSeed } from '../../demo/seed';
import { buildPlanView } from './planModel';

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
    expect(v.steps[0].soon).toBe(true);
    expect(v.steps[1].soon).toBe(false);
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
