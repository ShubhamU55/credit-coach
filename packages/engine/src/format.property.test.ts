import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatINR } from './format';

/** `₹` (U+20B9) prefix and `−` (U+2212) minus sign, matching `formatINR`'s output. */
const RUPEE_SIGN = '₹';
const MINUS_SIGN = '−';
/** `formatINR` output shape: an optional minus sign, the rupee prefix, then the digits. */
const FORMATTED_PATTERN = new RegExp(`^(${MINUS_SIGN})?${RUPEE_SIGN}(.*)$`);
/** Indian digit grouping: the last 3 digits together, then 2-digit groups. */
const INDIAN_GROUPING_PATTERN = /^(\d{1,3}|\d{1,2}(,\d{2})*,\d{3})$/;

describe('formatINR', () => {
  // criterion: boundary:huge-amount
  it('renders a validly-signed, Indian-grouped integer string for any safe-integer rupee amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
        (n) => {
          // Act
          const out = formatINR(n);

          // Assert: shape is (optional minus)(rupee sign)(digits)
          const match = FORMATTED_PATTERN.exec(out);
          expect(match).not.toBeNull();
          const sign = (match as RegExpExecArray)[1] ?? '';
          const digits = (match as RegExpExecArray)[2] ?? '';

          // Assert: sign present iff the rounded amount is negative and non-zero
          const rounded = Math.round(n);
          const expectSign = rounded !== 0 && n < 0;
          expect(sign === MINUS_SIGN).toBe(expectSign);

          // Assert: stripping commas from the digits equals the absolute rounded magnitude
          expect(digits.replace(/,/g, '')).toBe(String(Math.abs(rounded)));

          // Assert: the digits follow Indian 2-digit grouping after the first 3 digits
          expect(digits).toMatch(INDIAN_GROUPING_PATTERN);
        },
      ),
    );
  });
});
