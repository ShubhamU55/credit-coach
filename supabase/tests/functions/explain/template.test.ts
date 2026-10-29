import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildTemplateExplanation, type CoachRules } from '@credit-coach/engine';
import { validatePayload } from '../../../functions/explain/payload.ts';
import { templateFromPayload } from '../../../functions/explain/template.ts';
import { scenario } from './fixtures.ts';

/** The server copy must say exactly what the engine says for the same plan. */
function expectParity(slug: string, options: { cash?: number; rules?: Partial<CoachRules> }) {
  const { plan, cards, payload } = scenario(slug, options);
  expect(validatePayload(payload).ok).toBe(true);
  expect(templateFromPayload(payload)).toBe(buildTemplateExplanation(plan, cards));
}

describe('templateFromPayload (pinned to the engine template)', () => {
  it('matches the engine for the Aarav golden plan', () => {
    expectParity('aarav', {});
    expect(templateFromPayload(scenario('aarav', {}).payload)).toContain(
      '₹70,490 on HDFC Millennia',
    );
  });

  it('matches the engine with the 10% switch on', () => {
    expectParity('aarav', { rules: { aimFor10: true } });
  });

  it('matches the engine at a 20% threshold', () => {
    expectParity('aarav', { rules: { thresholdPct: 20 } });
  });

  it('matches the engine for Rohan: overdue minimum plus a shortfall', () => {
    expectParity('rohan', {});
    const text = templateFromPayload(scenario('rohan', {}).payload);
    expect(text).toContain('Overdue minimums come first');
    expect(text).toContain('₹1,330 short of the ₹2,880 minimum on ICICI Amazon Pay');
  });

  it('matches the engine for Rohan with enough cash, and for Ishita', () => {
    expectParity('rohan', { cash: 60000 });
    expectParity('ishita', {});
  });

  it('matches the engine when there is no cash at all', () => {
    expectParity('aarav', { cash: 0 });
  });

  it('matches the engine for any persona, cash, threshold and switch (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('aarav', 'ishita', 'rohan'),
        fc.integer({ min: 0, max: 400000 }),
        fc.integer({ min: 5, max: 50 }),
        fc.boolean(),
        (slug, cash, thresholdPct, aimFor10) => {
          expectParity(slug, { cash, rules: { thresholdPct, aimFor10 } });
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('examples/explain-aarav.json (used by the OWNER-STEPS curl check)', () => {
  it('is exactly the payload the engine builds for the Aarav golden plan', async () => {
    const { readFileSync } = await import('node:fs');
    const file = new URL('../../../examples/explain-aarav.json', import.meta.url);

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(scenario('aarav', {}).payload);
  });
});
