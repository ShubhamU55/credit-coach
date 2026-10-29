import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  buildTemplateExplanation,
  type Card,
  type ExplainPayload as EnginePayload,
} from '@credit-coach/engine';
import {
  validatePayload,
  type ExplainPayload as ServerPayload,
} from '../../../functions/explain/payload.ts';
import { isAcceptableAiText } from '../../../functions/explain/grounding.ts';
import { templateFromPayload } from '../../../functions/explain/template.ts';
import { scenario } from './fixtures.ts';

describe('the server request type is the engine payload type', () => {
  it('is identical, checked by the TypeScript compiler (pnpm typecheck)', () => {
    // If the engine adds, renames or retypes a payload field, this line stops compiling.
    expectTypeOf<ServerPayload>().toEqualTypeOf<EnginePayload>();
    expect(true).toBe(true);
  });
});

describe('a card with no limit (utilization is null)', () => {
  const editCards = (cards: Card[]): Card[] =>
    cards.map((c) => (c.id === 'sbi-simplyclick' ? { ...c, limit: 0 } : c));

  it('still validates, matches the engine template and passes grounding', () => {
    const { plan, cards, payload } = scenario('aarav', { editCards });

    expect(plan.excludedCardIds).toContain('sbi-simplyclick');
    expect(validatePayload(payload).ok).toBe(true);
    expect(templateFromPayload(payload)).toBe(buildTemplateExplanation(plan, cards));
    expect(isAcceptableAiText(templateFromPayload(payload), payload)).toBe(true);
  });

  it('validates a payload whose utilization fields are all null', () => {
    const { payload } = scenario('aarav');
    const allNull = {
      ...payload,
      overallUtilizationBefore: null,
      overallUtilizationAfter: null,
      highestCardBefore: null,
      highestCardAfter: null,
      items: payload.items.map((i) => ({ ...i, utilizationBefore: null, utilizationAfter: null })),
    };

    expect(validatePayload(allNull).ok).toBe(true);
    expect(templateFromPayload(allNull)).not.toContain('NaN');
    expect(isAcceptableAiText(templateFromPayload(allNull), allNull)).toBe(true);
  });
});
