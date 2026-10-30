import { describe, expect, it } from 'vitest';
import { diffAudit, formatValue, shortId } from './audit';

describe('diffAudit', () => {
  it('lists only the changed fields of an UPDATE and ignores the edit stamp', () => {
    const diff = diffAudit(
      'UPDATE',
      { id: 1, threshold_pct: 30, excellent_pct: 10, updated_at: 'a', updated_by: 'u1' },
      { id: 1, threshold_pct: 20, excellent_pct: 10, updated_at: 'b', updated_by: 'u2' },
    );
    expect(diff).toEqual([{ field: 'threshold_pct', before: '30', after: '20' }]);
  });

  it('compares arrays deeply and prints them readably', () => {
    const diff = diffAudit(
      'UPDATE',
      { planner_step_order: ['overdue', 'minimum'], reminder_due_days: [3, 1] },
      { planner_step_order: ['minimum', 'overdue'], reminder_due_days: [3, 1] },
    );
    expect(diff).toEqual([
      { field: 'planner_step_order', before: 'overdue, minimum', after: 'minimum, overdue' },
    ]);
  });

  it('breaks predictor_weights into one line per changed key', () => {
    const diff = diffAudit(
      'UPDATE',
      { predictor_weights: { creditAge: 16, creditMix: 8 } },
      { predictor_weights: { creditAge: 20, creditMix: 8 } },
    );
    expect(diff).toEqual([{ field: 'predictor_weights.creditAge', before: '16', after: '20' }]);
  });

  it('shows every field of an INSERT as new and every field of a DELETE as removed', () => {
    expect(diffAudit('INSERT', null, { slug: 'a', score: 700 })).toEqual([
      { field: 'slug', before: '(none)', after: 'a' },
      { field: 'score', before: '(none)', after: '700' },
    ]);
    expect(diffAudit('DELETE', { slug: 'a' }, null)).toEqual([
      { field: 'slug', before: 'a', after: '(none)' },
    ]);
  });

  it('returns nothing when nothing but the stamp changed', () => {
    expect(diffAudit('UPDATE', { a: 1, updated_at: 'x' }, { a: 1, updated_at: 'y' })).toEqual([]);
  });

  it('tolerates a missing before or after on an UPDATE', () => {
    expect(diffAudit('UPDATE', null, { a: 1 })).toEqual([
      { field: 'a', before: '(none)', after: '1' },
    ]);
  });
});

describe('formatValue and shortId', () => {
  it('formats null, booleans and nested values', () => {
    expect(formatValue(null)).toBe('(none)');
    expect(formatValue(true)).toBe('true');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('shortens a uuid and handles a missing actor', () => {
    expect(shortId('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567');
    expect(shortId(null)).toBe('system');
  });
});
