import { describe, it, expect } from 'vitest';
import { DEFAULT_COACH_RULES, PLANNER_STEPS } from './types';

describe('DEFAULT_COACH_RULES', () => {
  it('uses the PRD defaults: 30% threshold, 10% excellent line, statement basis, 10% switch off', () => {
    // Assert
    expect(DEFAULT_COACH_RULES).toEqual({
      thresholdPct: 30,
      excellentPct: 10,
      reportingBasis: 'statement',
      payByBufferDays: 1,
      aimFor10: false,
      plannerStepOrder: ['overdue', 'minimum', 'statement', 'prepay'],
    });
  });

  it('lists every planner step exactly once, in the PRD §5.3 priority order', () => {
    expect(PLANNER_STEPS).toEqual(['overdue', 'minimum', 'statement', 'prepay']);
    expect(DEFAULT_COACH_RULES.plannerStepOrder).toEqual(PLANNER_STEPS);
  });
});
