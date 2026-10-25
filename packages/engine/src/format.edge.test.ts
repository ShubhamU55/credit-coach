import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatShortDate, formatRelativeDate } from './format';

describe('formatRelativeDate / formatShortDate month-end boundary', () => {
  // criterion: boundary:month-end
  it('formatRelativeDate and formatShortDate roll over correctly across a month-end boundary', () => {
    expect(formatRelativeDate('2026-11-01', '2026-10-31')).toBe('tomorrow');
    expect(formatRelativeDate('2027-01-03', '2026-12-31')).toBe('in 3 days');
    expect(formatShortDate('2026-10-31')).toBe('Sat, 31 Oct');
  });
});

describe('formatShortDate / formatRelativeDate leap day', () => {
  // criterion: boundary:leap-day
  it('formatShortDate and formatRelativeDate handle 29 February on a leap year', () => {
    expect(formatShortDate('2028-02-29')).toBe('Tue, 29 Feb');
    expect(formatRelativeDate('2028-02-29', '2028-02-28')).toBe('tomorrow');
    expect(formatRelativeDate('2028-03-01', '2028-02-28')).toBe('in 2 days');
  });
});

describe('formatShortDate / formatRelativeDate time-zone independence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // criterion: boundary:time-zone
  it('formatShortDate and formatRelativeDate return identical output regardless of the host time zone', () => {
    const zones = ['America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati'];
    for (const zone of zones) {
      // Arrange
      vi.stubEnv('TZ', zone);

      // Act / Assert
      expect(formatShortDate('2026-10-22')).toBe('Thu, 22 Oct');
      expect(formatRelativeDate('2026-10-22', '2026-10-21')).toBe('tomorrow');
    }
  });
});
