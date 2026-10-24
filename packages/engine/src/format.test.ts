import { describe, it, expect } from 'vitest';
import {
  formatINR,
  formatPercent,
  formatShortDate,
  formatRelativeDate,
  formatScoreRange,
  maskPan,
  formatBeforeAfter,
} from './format';

describe('formatINR', () => {
  it('formats integer rupees with Indian grouping and a rupee prefix', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(620)).toBe('₹620');
    expect(formatINR(120000)).toBe('₹1,20,000');
    expect(formatINR(12345678)).toBe('₹1,23,45,678');
  });
  it('formats negative amounts with the minus sign (U+2212)', () => {
    expect(formatINR(-500)).toBe('−₹500');
  });
  it('rounds to the nearest rupee before formatting', () => {
    expect(formatINR(1999.6)).toBe('₹2,000');
  });
});

describe('formatPercent', () => {
  it('formats to 1 dp with a percent sign', () => {
    expect(formatPercent(45)).toBe('45.0%');
    expect(formatPercent(18.66)).toBe('18.7%');
  });
});

describe('formatShortDate', () => {
  it('formats a YYYY-MM-DD calendar date with no time zone', () => {
    expect(formatShortDate('2026-10-22')).toBe('Thu, 22 Oct');
  });
});

describe('formatRelativeDate', () => {
  it('returns "tomorrow" for the day after today', () => {
    expect(formatRelativeDate('2026-10-22', '2026-10-21')).toBe('tomorrow');
  });
  it('returns "today" for the same day', () => {
    expect(formatRelativeDate('2026-10-21', '2026-10-21')).toBe('today');
  });
  it('returns "in N days" for 2 to 7 days out', () => {
    expect(formatRelativeDate('2026-10-25', '2026-10-21')).toBe('in 4 days');
  });
  it('falls back to the short date beyond 7 days', () => {
    expect(formatRelativeDate('2026-11-04', '2026-10-21')).toBe('Wed, 4 Nov');
  });
  it('falls back to the short date for a day in the past', () => {
    expect(formatRelativeDate('2026-10-18', '2026-10-21')).toBe('Sun, 18 Oct');
  });
});

describe('formatScoreRange', () => {
  it('orders and joins with an en dash', () => {
    expect(formatScoreRange(708, 736)).toBe('708–736');
    expect(formatScoreRange(736, 708)).toBe('708–736');
  });
  it('clamps both bounds to 300-900', () => {
    expect(formatScoreRange(250, 320)).toBe('300–320');
    expect(formatScoreRange(880, 950)).toBe('880–900');
  });
});

describe('maskPan', () => {
  it('masks the middle, keeping the first 2 and last 3', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABXXXXX34F');
  });
  it('trims and uppercases before matching', () => {
    expect(maskPan(' abcde1234f ')).toBe('ABXXXXX34F');
  });
  it('throws a RangeError for an invalid PAN', () => {
    expect(() => maskPan('ABC')).toThrow(RangeError);
  });
});

describe('formatBeforeAfter', () => {
  it('joins before and after with an arrow', () => {
    expect(formatBeforeAfter('19.5%', '18.7%')).toBe('19.5% → 18.7%');
  });
});
