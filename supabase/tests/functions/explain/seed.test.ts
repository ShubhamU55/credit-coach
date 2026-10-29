import { describe, expect, it } from 'vitest';
import { formatINR } from '@credit-coach/engine';
import { loadPersonas, scenario } from './fixtures.ts';

const amounts = (slug: string, rules = {}, cash?: number) =>
  scenario(slug, { rules, cash }).plan.items.map((i) => [i.cardId, i.amount] as const);

describe('seed personas (from the demo_data migration)', () => {
  it('defines Aarav, Ishita and Rohan with a masked PAN and mobile only', () => {
    const personas = loadPersonas();

    expect(personas.map((p) => p.slug)).toEqual(['aarav', 'ishita', 'rohan']);
    for (const p of personas) {
      expect(p.pan_masked).toMatch(/^[A-Z]{2}X{5}[0-9]{2}[A-Z]$/);
      expect(p.mobile_masked).toMatch(/^\+91 [0-9]{2}X{5}[0-9]{3}$/);
      expect(p.score).toBeGreaterThanOrEqual(300);
      expect(p.score).toBeLessThanOrEqual(900);
    }
    expect(personas.filter((p) => p.is_default).map((p) => p.slug)).toEqual(['aarav']);
  });

  it('gives Aarav the docs/design.md section 8 totals and score anchor', () => {
    const aarav = loadPersonas().find((p) => p.slug === 'aarav');
    const cards = aarav?.report.cards ?? [];

    expect(cards.reduce((s, c) => s + c.limit, 0)).toBe(300000);
    expect(cards.reduce((s, c) => s + c.outstanding, 0)).toBe(135000);
    expect(aarav).toMatchObject({ score: 724, score_date: '2026-10-02', cash: 120000 });
    expect(aarav).toMatchObject({ history_months: 36, missed_payments: 0, hard_inquiries_6m: 1 });
  });

  it('produces the golden Aarav plan from the seeded cards', () => {
    const { plan } = scenario('aarav');

    expect(plan.items.map((i) => [i.cardId, i.kind, i.amount, i.payBy])).toEqual([
      ['axis-neo', 'minimum', 620, '2026-10-22'],
      ['hdfc-millennia', 'minimum', 3710, '2026-11-04'],
      ['axis-neo', 'statement', 11780, '2026-10-22'],
      ['hdfc-millennia', 'statement', 70490, '2026-11-04'],
      ['sbi-simplyclick', 'prepay', 2400, '2026-10-24'],
    ]);
    expect(plan.leftover).toBe(31000);
    expect(plan.overallUtilizationBefore).toBe(45);
    expect(plan.overallUtilizationAfter).toBe(15.3);
  });

  it('moves the SBI step to 26,400 with the 10% switch and to 14,400 at a 20% threshold', () => {
    expect(amounts('aarav', { aimFor10: true }).at(-1)).toEqual(['sbi-simplyclick', 26400]);
    expect(scenario('aarav', { rules: { aimFor10: true } }).plan.leftover).toBe(7000);
    expect(amounts('aarav', { thresholdPct: 20 }).at(-1)).toEqual(['sbi-simplyclick', 14400]);
    expect(scenario('aarav', { rules: { thresholdPct: 20 } }).plan.leftover).toBe(19000);
  });

  it('puts Rohan in the overdue and shortfall state with 3,000 of cash', () => {
    const { plan } = scenario('rohan');

    expect(plan.items[0]).toMatchObject({
      cardId: 'kotak-811',
      kind: 'overdue_minimum',
      amount: 1450,
    });
    expect(plan.items[1]).toMatchObject({
      cardId: 'icici-amazon-pay',
      kind: 'minimum',
      amount: 1550,
    });
    expect(plan.shortfalls).toHaveLength(1);
    expect(plan.shortfalls[0]).toMatchObject({
      cardId: 'icici-amazon-pay',
      required: 2880,
      shortfall: 1330,
    });
    expect(formatINR(plan.shortfalls[0]?.shortfall ?? 0)).toBe('₹1,330');
  });

  it('gives Ishita one FD-backed card that a modest budget clears without a shortfall', () => {
    const ishita = loadPersonas().find((p) => p.slug === 'ishita');
    const { plan } = scenario('ishita');

    expect(ishita?.report.cards).toHaveLength(1);
    expect(ishita?.report.cards[0]?.secured).toBe(true);
    expect(ishita).toMatchObject({ score: 690, history_months: 14 });
    expect(plan.shortfalls).toEqual([]);
    expect(plan.withinThreshold).toBe(true);
  });
});
