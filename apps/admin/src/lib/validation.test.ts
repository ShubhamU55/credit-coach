import { describe, expect, it } from 'vitest';
import { DEFAULT_RAW_RULES, validateRules, type RawRules } from './validation';

const raw = (over: Partial<RawRules> = {}): RawRules => ({ ...DEFAULT_RAW_RULES, ...over });

function errorsOf(over: Partial<RawRules>): Record<string, string> {
  const r = validateRules(raw(over));
  if (r.ok) throw new Error('expected validation to fail');
  return r.errors;
}

describe('validateRules', () => {
  it('accepts the seeded defaults and returns typed values', () => {
    const r = validateRules(raw());
    expect(r).toEqual({
      ok: true,
      value: {
        threshold_pct: 30,
        excellent_pct: 10,
        reporting_basis: 'statement',
        pay_by_buffer_days: 1,
        planner_step_order: ['overdue', 'minimum', 'statement', 'prepay'],
        predictor_weights: {
          paymentHistory: 35,
          overallUtilization: 11,
          maxCardUtilization: 11,
          hardInquiries: 12,
          creditAge: 16,
          openAccounts: 7,
          creditMix: 8,
        },
        guard_min_hard_inquiries: 2,
        reminder_prepay_days: 2,
        reminder_due_days: [3, 1],
      },
    });
  });

  it.each([
    ['threshold_pct', 4, 5, 50, 51],
    ['excellent_pct', 0, 1, 30, 31],
    ['pay_by_buffer_days', -1, 0, 7, 8],
    ['guard_min_hard_inquiries', 0, 1, 10, 11],
    ['reminder_prepay_days', -1, 0, 14, 15],
  ] as const)('%s: rejects %i, accepts %i and %i, rejects %i', (field, below, lo, hi, above) => {
    expect(errorsOf({ [field]: String(below) })).toHaveProperty(field);
    expect(validateRules(raw({ [field]: String(lo) })).ok).toBe(true);
    expect(validateRules(raw({ [field]: String(hi) })).ok).toBe(true);
    expect(errorsOf({ [field]: String(above) })).toHaveProperty(field);
  });

  it.each(['', '  ', '12.5', 'abc', '1e1', '--3'])('rejects the non-integer %j', (bad) => {
    expect(errorsOf({ threshold_pct: bad })).toHaveProperty('threshold_pct');
    expect(errorsOf({ pay_by_buffer_days: bad })).toHaveProperty('pay_by_buffer_days');
  });

  it('does not treat a missing field as zero', () => {
    const input = raw();
    delete input.pay_by_buffer_days;
    const r = validateRules(input);
    expect(r.ok).toBe(false);
  });

  it('accepts only the two reporting bases', () => {
    expect(validateRules(raw({ reporting_basis: 'weekly_current' })).ok).toBe(true);
    expect(errorsOf({ reporting_basis: 'monthly' })).toHaveProperty('reporting_basis');
    expect(errorsOf({ reporting_basis: '' })).toHaveProperty('reporting_basis');
  });

  it('requires the planner steps to be a permutation of the four steps', () => {
    const ok = validateRules(
      raw({ step_1: 'prepay', step_2: 'statement', step_3: 'minimum', step_4: 'overdue' }),
    );
    expect(ok.ok).toBe(true);
    expect(errorsOf({ step_2: 'overdue' })).toHaveProperty('planner_step_order');
    expect(errorsOf({ step_4: 'bogus' })).toHaveProperty('planner_step_order');
    expect(errorsOf({ step_1: '' })).toHaveProperty('planner_step_order');
  });

  it('accepts weights from 0 to 100 including decimals, and rejects the rest', () => {
    expect(validateRules(raw({ w_creditMix: '0' })).ok).toBe(true);
    expect(validateRules(raw({ w_creditMix: '100' })).ok).toBe(true);
    expect(validateRules(raw({ w_creditMix: '12.5' })).ok).toBe(true);
    expect(errorsOf({ w_creditMix: '100.1' })).toHaveProperty('w_creditMix');
    expect(errorsOf({ w_creditMix: '-1' })).toHaveProperty('w_creditMix');
    expect(errorsOf({ w_creditMix: '' })).toHaveProperty('w_creditMix');
    expect(errorsOf({ w_creditMix: 'NaN' })).toHaveProperty('w_creditMix');
    expect(errorsOf({ w_creditMix: 'Infinity' })).toHaveProperty('w_creditMix');
  });

  it('takes 1 to 5 reminder due days, each 0 to 14', () => {
    expect(validateRules(raw({ reminder_due_days: '0' })).ok).toBe(true);
    expect(validateRules(raw({ reminder_due_days: '14, 7, 3, 1, 0' })).ok).toBe(true);
    expect(errorsOf({ reminder_due_days: '' })).toHaveProperty('reminder_due_days');
    expect(errorsOf({ reminder_due_days: '1,2,3,4,5,6' })).toHaveProperty('reminder_due_days');
    expect(errorsOf({ reminder_due_days: '15' })).toHaveProperty('reminder_due_days');
    expect(errorsOf({ reminder_due_days: '-1' })).toHaveProperty('reminder_due_days');
    expect(errorsOf({ reminder_due_days: '3,,1' })).toHaveProperty('reminder_due_days');
    expect(errorsOf({ reminder_due_days: '3,x' })).toHaveProperty('reminder_due_days');
  });

  it('reports every bad field at once', () => {
    const errors = errorsOf({ threshold_pct: '51', excellent_pct: '31' });
    expect(Object.keys(errors).sort()).toEqual(['excellent_pct', 'threshold_pct']);
  });
});
