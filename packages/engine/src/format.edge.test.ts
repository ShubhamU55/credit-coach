import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatShortDate, formatRelativeDate, maskPan } from './format';

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

describe('maskPan Unicode look-alikes', () => {
  // criterion: boundary:unicode
  it('maskPan rejects PAN-shaped strings built from non-ASCII look-alike characters', () => {
    // Fullwidth Latin letters and digits (U+FF21-FF3A, U+FF10-FF19), shaped like "ABCDE1234F".
    // Built from code points, not literal/escaped characters, so the source file itself never
    // contains an irregular-whitespace or mixed-script character.
    const fullwidthPan = String.fromCodePoint(
      0xff21,
      0xff22,
      0xff23,
      0xff24,
      0xff25,
      0xff11,
      0xff12,
      0xff13,
      0xff14,
      0xff26,
    );
    expect(maskPan(fullwidthPan)).toBeNull();

    // Devanagari digits (U+0966-U+0969) in the 4 numeric positions
    const devanagariDigits = String.fromCodePoint(0x0966, 0x0967, 0x0968, 0x0969);
    const devanagariPan = `ABCDE${devanagariDigits}F`;
    expect(maskPan(devanagariPan)).toBeNull();

    // Zero-width space (U+200B) embedded where the plain space before trim would be
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    const zeroWidthSpacePan = `${zeroWidthSpace}ABCDE1234F${zeroWidthSpace}`;
    expect(maskPan(zeroWidthSpacePan)).toBeNull();

    // Non-breaking space (U+00A0) in place of the plain space before trim
    const nonBreakingSpace = String.fromCodePoint(0x00a0);
    const nonBreakingSpacePan = `${nonBreakingSpace}ABCDE1234F${nonBreakingSpace}`;
    expect(maskPan(nonBreakingSpacePan)).toBeNull();
  });
});
