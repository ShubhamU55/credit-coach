import * as ui from './index';

// Screens import from this barrel (`import { PopButton } from '../ui'`). If a component is added
// to the kit and forgotten here, screens cannot reach it: this list is the contract.
const FUNCTIONS = [
  // primitives
  'Text',
  'PopPressable',
  'useReduceMotion',
  'usePressed',
  'clampPercent',
  'percentStyle',
  'useAppFonts',
  'finishForIndex',
  // part A components
  'PopButton',
  'SecondaryButton',
  'TextAction',
  'SwitchRow',
  'ChoiceRows',
  'AmountInput',
  // part B: information blocks
  'StatusChip',
  'Disclaimer',
  'SampleStrip',
  'AIExplanation',
  'ReasonRow',
  'StatTile',
  'UtilizationLabel',
  'isOverThreshold',
  // part B: plan visuals
  'BeforeAfterBar',
  'PlanStepCard',
  'DateBlockTimeline',
  'PaymentTimelineStrip',
  'windowPercent',
  // part B: score visuals
  'ScoreRangeText',
  'ScoreCard',
  'WhatIfTile',
];

const OBJECTS = [
  'color',
  'cardFinish',
  'scoreZone',
  'shadow',
  'space',
  'type',
  'fontFamily',
  'overlay',
  'kitShadow',
];

const STRINGS = ['DISCLAIMER_TEXT', 'AI_LABEL', 'TEMPLATE_LABEL', 'noShadow'];

describe('ui barrel', () => {
  test.each(FUNCTIONS)('exports %s as a function', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('function');
  });

  test.each(OBJECTS)('exports %s as an object', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('object');
  });

  test.each(STRINGS)('exports %s as a string', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('string');
  });

  test('the disclaimer constant is the fixed copy', () => {
    expect(ui.DISCLAIMER_TEXT).toBe(
      'Estimates only. Not your official CIBIL score. Not financial advice.',
    );
  });

  test('exports nothing outside the expected names, so a stray export is noticed', () => {
    const expected = new Set([...FUNCTIONS, ...OBJECTS, ...STRINGS]);
    const extra = Object.keys(ui).filter((name) => !expected.has(name));
    expect(extra).toEqual([]);
  });
});
