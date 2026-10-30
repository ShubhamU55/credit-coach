import { createDemoRepository } from '../demo/repository';
import { parseCoachRulesRow, toDemoRules } from './rules';

/** The row the migration inserts (`insert into coach_rules default values`). */
const DEFAULT_ROW = {
  id: 1,
  threshold_pct: 30,
  excellent_pct: 10,
  reporting_basis: 'statement',
  pay_by_buffer_days: 1,
  planner_step_order: ['overdue', 'minimum', 'statement', 'prepay'],
  predictor_weights: { paymentHistory: 35 },
  guard_min_hard_inquiries: 2,
  reminder_prepay_days: 2,
  reminder_due_days: [3, 1],
  updated_at: '2026-10-28T10:00:00+00:00',
  updated_by: null,
};

const seedRules = () => createDemoRepository().getRules();

describe('the default coach_rules row', () => {
  it('maps to exactly the seed rules, so the golden demo numbers cannot change', () => {
    const parsed = parseCoachRulesRow(DEFAULT_ROW);

    expect(parsed).not.toBeNull();
    expect(toDemoRules(parsed!, seedRules())).toEqual(seedRules());
  });
});

describe('parseCoachRulesRow', () => {
  it('maps an admin-edited row', () => {
    const parsed = parseCoachRulesRow({
      ...DEFAULT_ROW,
      threshold_pct: 25,
      excellent_pct: 8,
      reporting_basis: 'weekly_current',
      guard_min_hard_inquiries: 4,
    });

    expect(toDemoRules(parsed!, seedRules())).toEqual({
      ...seedRules(),
      thresholdPct: 25,
      excellentPct: 8,
      reportingBasis: 'weekly_current',
      minHardInquiries6m: 4,
    });
  });

  it('keeps the user-controlled aimFor10 switch from the current rules', () => {
    const parsed = parseCoachRulesRow(DEFAULT_ROW);

    expect(toDemoRules(parsed!, { ...seedRules(), aimFor10: true }).aimFor10).toBe(true);
  });

  it('accepts the exact edges of every CHECK range', () => {
    const low = {
      ...DEFAULT_ROW,
      threshold_pct: 5,
      excellent_pct: 1,
      pay_by_buffer_days: 0,
      guard_min_hard_inquiries: 1,
    };
    const high = {
      ...DEFAULT_ROW,
      threshold_pct: 50,
      excellent_pct: 30,
      pay_by_buffer_days: 7,
      guard_min_hard_inquiries: 10,
    };

    expect(parseCoachRulesRow(low)).not.toBeNull();
    expect(parseCoachRulesRow(high)).not.toBeNull();
  });

  it.each([
    ['not an object', 'rules'],
    ['null', null],
    ['an array', []],
    ['threshold below 5', { ...DEFAULT_ROW, threshold_pct: 4 }],
    ['threshold above 50', { ...DEFAULT_ROW, threshold_pct: 51 }],
    ['threshold fractional', { ...DEFAULT_ROW, threshold_pct: 30.5 }],
    ['threshold a string', { ...DEFAULT_ROW, threshold_pct: '30' }],
    ['excellent below 1', { ...DEFAULT_ROW, excellent_pct: 0 }],
    ['excellent above 30', { ...DEFAULT_ROW, excellent_pct: 31 }],
    ['unknown reporting basis', { ...DEFAULT_ROW, reporting_basis: 'monthly' }],
    ['negative buffer', { ...DEFAULT_ROW, pay_by_buffer_days: -1 }],
    ['buffer above 7', { ...DEFAULT_ROW, pay_by_buffer_days: 8 }],
    ['guard below 1', { ...DEFAULT_ROW, guard_min_hard_inquiries: 0 }],
    ['guard above 10', { ...DEFAULT_ROW, guard_min_hard_inquiries: 11 }],
    ['step order too short', { ...DEFAULT_ROW, planner_step_order: ['overdue', 'minimum'] }],
    [
      'step order with a duplicate',
      { ...DEFAULT_ROW, planner_step_order: ['overdue', 'overdue', 'statement', 'prepay'] },
    ],
    [
      'step order with an unknown step',
      { ...DEFAULT_ROW, planner_step_order: ['overdue', 'minimum', 'statement', 'close'] },
    ],
    ['step order not an array', { ...DEFAULT_ROW, planner_step_order: 'overdue' }],
    ['a missing field', { ...DEFAULT_ROW, threshold_pct: undefined }],
  ])('rejects the whole row when %s', (_name, row) => {
    expect(parseCoachRulesRow(row)).toBeNull();
  });
});
