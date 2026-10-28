import { describe, it, expect } from 'vitest';
import {
  addDays,
  cardCycle,
  lastStatementDate,
  nextReportingPoint,
  nextStatementDate,
  nextWeeklySnapshot,
} from './reporting';
import { DEFAULT_COACH_RULES, type Card, type CoachRules } from './types';

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'c1',
  name: 'Test card',
  issuer: 'Test bank',
  limit: 100000,
  outstanding: 50000,
  lastStatementBalance: 40000,
  statementDay: 15,
  dueDay: 4,
  minimumDue: 2000,
  paidSinceStatement: 0,
  ...overrides,
});

const rules = (overrides: Partial<CoachRules> = {}): CoachRules => ({
  ...DEFAULT_COACH_RULES,
  ...overrides,
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('rejects a date that does not exist', () => {
    expect(() => addDays('2027-02-29', 1)).toThrow(RangeError);
    expect(() => addDays('21-10-2026', 1)).toThrow(RangeError);
  });
});

describe('lastStatementDate / nextStatementDate', () => {
  it('finds the Aarav statement dates on 21 Oct 2026', () => {
    // HDFC Millennia (15th), Axis Neo (2nd), SBI SimplyClick (25th)
    expect(lastStatementDate(card({ statementDay: 15 }), '2026-10-21')).toBe('2026-10-15');
    expect(nextStatementDate(card({ statementDay: 15 }), '2026-10-21')).toBe('2026-11-15');
    expect(lastStatementDate(card({ statementDay: 2 }), '2026-10-21')).toBe('2026-10-02');
    expect(nextStatementDate(card({ statementDay: 2 }), '2026-10-21')).toBe('2026-11-02');
    expect(lastStatementDate(card({ statementDay: 25 }), '2026-10-21')).toBe('2026-09-25');
    expect(nextStatementDate(card({ statementDay: 25 }), '2026-10-21')).toBe('2026-10-25');
  });

  it('treats a statement generated today as the last one; the next is a month away', () => {
    expect(lastStatementDate(card({ statementDay: 21 }), '2026-10-21')).toBe('2026-10-21');
    expect(nextStatementDate(card({ statementDay: 21 }), '2026-10-21')).toBe('2026-11-21');
  });

  it('clamps a statement day past the month end to the last day of the month', () => {
    expect(lastStatementDate(card({ statementDay: 31 }), '2026-04-30')).toBe('2026-04-30');
    expect(nextStatementDate(card({ statementDay: 31 }), '2026-04-30')).toBe('2026-05-31');
    expect(lastStatementDate(card({ statementDay: 31 }), '2027-02-15')).toBe('2027-01-31');
    expect(nextStatementDate(card({ statementDay: 31 }), '2027-02-15')).toBe('2027-02-28');
  });

  it('lands on 29 Feb in a leap year', () => {
    expect(nextStatementDate(card({ statementDay: 30 }), '2028-02-15')).toBe('2028-02-29');
    expect(lastStatementDate(card({ statementDay: 30 }), '2028-02-29')).toBe('2028-02-29');
    expect(nextStatementDate(card({ statementDay: 30 }), '2028-02-29')).toBe('2028-03-30');
  });

  it('rolls over the year in both directions', () => {
    expect(nextStatementDate(card({ statementDay: 5 }), '2026-12-20')).toBe('2027-01-05');
    expect(lastStatementDate(card({ statementDay: 5 }), '2027-01-03')).toBe('2026-12-05');
  });

  it('rejects a statement day outside 1-31 or not a whole number', () => {
    expect(() => nextStatementDate(card({ statementDay: 0 }), '2026-10-21')).toThrow(RangeError);
    expect(() => nextStatementDate(card({ statementDay: 32 }), '2026-10-21')).toThrow(RangeError);
    expect(() => nextStatementDate(card({ statementDay: 1.5 }), '2026-10-21')).toThrow(RangeError);
  });
});

describe('cardCycle', () => {
  it('derives the Aarav HDFC Millennia and Axis Neo due dates', () => {
    const hdfc = card({ id: 'hdfc', statementDay: 15, dueDay: 4, lastStatementBalance: 74200 });
    const axis = card({ id: 'axis', statementDay: 2, dueDay: 22, lastStatementBalance: 12400 });

    expect(cardCycle(hdfc, '2026-10-21')).toEqual({
      cardId: 'hdfc',
      lastStatementDate: '2026-10-15',
      nextStatementDate: '2026-11-15',
      dueDate: '2026-11-04',
      remainingStatement: 74200,
      remainingMinimum: 2000,
      isOverdue: false,
    });
    expect(cardCycle(axis, '2026-10-21').dueDate).toBe('2026-10-22');
  });

  it('has no due date when the statement was paid in full, however that is encoded', () => {
    const nothingBilled = card({ statementDay: 25, lastStatementBalance: 0, minimumDue: 0 });
    const paidOff = card({
      statementDay: 25,
      lastStatementBalance: 5000,
      minimumDue: 250,
      paidSinceStatement: 5000,
    });

    expect(cardCycle(nothingBilled, '2026-10-21').dueDate).toBeNull();
    expect(cardCycle(paidOff, '2026-10-21')).toMatchObject({
      dueDate: null,
      remainingStatement: 0,
      remainingMinimum: 0,
      isOverdue: false,
    });
  });

  it('floors remaining statement and minimum at 0 when more than the statement was paid', () => {
    const overpaid = card({
      lastStatementBalance: 3000,
      minimumDue: 150,
      paidSinceStatement: 9000,
    });

    expect(cardCycle(overpaid, '2026-10-21')).toMatchObject({
      remainingStatement: 0,
      remainingMinimum: 0,
    });
  });

  it('is overdue only after the due date and only while the minimum is unpaid', () => {
    const axis = card({
      statementDay: 2,
      dueDay: 22,
      lastStatementBalance: 12400,
      minimumDue: 620,
    });

    expect(cardCycle(axis, '2026-10-22').isOverdue).toBe(false);
    expect(cardCycle(axis, '2026-10-23').isOverdue).toBe(true);
    expect(cardCycle({ ...axis, paidSinceStatement: 619 }, '2026-10-23').isOverdue).toBe(true);
    expect(cardCycle({ ...axis, paidSinceStatement: 620 }, '2026-10-23').isOverdue).toBe(false);
  });

  it('puts the due date in the next month when the due day is on or before the statement day', () => {
    expect(cardCycle(card({ statementDay: 10, dueDay: 10 }), '2026-10-12').dueDate).toBe(
      '2026-11-10',
    );
  });

  it('clamps the due day to the month end, including a leap February', () => {
    // Statement 5 Feb 2027, due day 31 -> 28 Feb 2027
    expect(cardCycle(card({ statementDay: 5, dueDay: 31 }), '2027-02-10').dueDate).toBe(
      '2027-02-28',
    );
    // Statement 31 Jan 2028, due day 30 -> 29 Feb 2028
    expect(cardCycle(card({ statementDay: 31, dueDay: 30 }), '2028-02-10').dueDate).toBe(
      '2028-02-29',
    );
  });

  it('rejects an invalid due day', () => {
    expect(() => cardCycle(card({ dueDay: 0 }), '2026-10-21')).toThrow(RangeError);
  });
});

describe('nextWeeklySnapshot', () => {
  it('returns the next of the 7th, 14th, 21st, 28th or month-end, strictly after today', () => {
    expect(nextWeeklySnapshot('2026-10-01')).toBe('2026-10-07');
    expect(nextWeeklySnapshot('2026-10-07')).toBe('2026-10-14');
    expect(nextWeeklySnapshot('2026-10-21')).toBe('2026-10-28');
    expect(nextWeeklySnapshot('2026-10-28')).toBe('2026-10-31');
    expect(nextWeeklySnapshot('2026-10-31')).toBe('2026-11-07');
    expect(nextWeeklySnapshot('2026-04-29')).toBe('2026-04-30');
    expect(nextWeeklySnapshot('2026-12-31')).toBe('2027-01-07');
  });

  it('counts 28 Feb once in a non-leap year and adds 29 Feb in a leap year', () => {
    expect(nextWeeklySnapshot('2027-02-27')).toBe('2027-02-28');
    expect(nextWeeklySnapshot('2027-02-28')).toBe('2027-03-07');
    expect(nextWeeklySnapshot('2028-02-28')).toBe('2028-02-29');
    expect(nextWeeklySnapshot('2028-02-29')).toBe('2028-03-07');
  });
});

describe('nextReportingPoint', () => {
  const sbi = card({ id: 'sbi', statementDay: 25, lastStatementBalance: 0, minimumDue: 0 });

  it('statement basis: reported on the next statement date with the statement balance', () => {
    expect(nextReportingPoint(sbi, '2026-10-21', rules())).toEqual({
      cardId: 'sbi',
      basis: 'statement',
      date: '2026-10-25',
      balance: 'statement',
      payBy: '2026-10-24',
    });
  });

  it('applies the configured buffer, never moving pay-by before today', () => {
    expect(nextReportingPoint(sbi, '2026-10-21', rules({ payByBufferDays: 0 })).payBy).toBe(
      '2026-10-25',
    );
    expect(nextReportingPoint(sbi, '2026-10-21', rules({ payByBufferDays: 3 })).payBy).toBe(
      '2026-10-22',
    );
    expect(nextReportingPoint(sbi, '2026-10-21', rules({ payByBufferDays: 10 })).payBy).toBe(
      '2026-10-21',
    );
  });

  it('weekly_current basis: reported at the next snapshot with the current outstanding', () => {
    expect(
      nextReportingPoint(sbi, '2026-10-21', rules({ reportingBasis: 'weekly_current' })),
    ).toEqual({
      cardId: 'sbi',
      basis: 'weekly_current',
      date: '2026-10-28',
      balance: 'current',
      payBy: '2026-10-27',
    });
  });

  it('weekly_current basis on 28 Feb of a leap year reports on 29 Feb and pays today', () => {
    const point = nextReportingPoint(
      sbi,
      '2028-02-28',
      rules({ reportingBasis: 'weekly_current' }),
    );

    expect(point.date).toBe('2028-02-29');
    expect(point.payBy).toBe('2028-02-28');
  });

  it('rejects a negative or fractional buffer', () => {
    expect(() => nextReportingPoint(sbi, '2026-10-21', rules({ payByBufferDays: -1 }))).toThrow(
      RangeError,
    );
    expect(() => nextReportingPoint(sbi, '2026-10-21', rules({ payByBufferDays: 0.5 }))).toThrow(
      RangeError,
    );
  });
});
