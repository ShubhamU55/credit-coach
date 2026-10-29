import { describe, expect, it } from 'vitest';
import { isGrounded, numbersIn, payloadNumbers } from '../../../functions/explain/ground.ts';
import { scenario } from './fixtures.ts';

const aarav = scenario('aarav').payload;

describe('numbersIn', () => {
  it('normalises Indian grouping, currency, percents and ordinals', () => {
    expect([...numbersIn('₹1,20,000 at 45.0% by the 22nd, step 04')].sort((a, b) => a - b)).toEqual(
      [4, 22, 45, 120000],
    );
  });

  it('keeps a number that ends a clause', () => {
    expect(numbersIn('Pay ₹3,710, then wait.').has(3710)).toBe(true);
  });
});

describe('isGrounded', () => {
  it('accepts the template wording of the same plan', () => {
    expect(
      isGrounded(
        'Pay ₹620 on Axis Neo by Thu, 22 Oct. Overall utilization goes from 45.0% to 15.3%.',
        aarav,
      ),
    ).toBe(true);
  });

  it('accepts text with no numbers at all', () => {
    expect(isGrounded('Minimums come first, then the full statements.', aarav)).toBe(true);
  });

  it('rejects a number that is not in the payload', () => {
    expect(isGrounded('Pay ₹12,400 on Axis Neo.', aarav)).toBe(false);
    expect(isGrounded('Utilization falls to 12.5%.', aarav)).toBe(false);
  });

  it('does not let a key name such as aimFor10 make "10" legal', () => {
    // Dates with no 10 in them, so the only "10" left in the payload is inside a key.
    const payload = {
      ...aarav,
      today: '2026-03-21',
      thresholdPct: 30,
      cashUsed: 5000,
      leftover: 7000,
      overallUtilizationBefore: 45,
      overallUtilizationAfter: 15.3,
      highestCardBefore: 81,
      highestCardAfter: 30,
      shortfalls: [],
      items: aarav.items.map((i) => ({
        ...i,
        step: 1,
        amount: 600,
        payBy: '2026-03-22',
        utilizationBefore: 20,
        utilizationAfter: 5,
      })),
    };

    expect(payloadNumbers(payload).has(10)).toBe(false);
    expect(isGrounded('Keep it under 10%.', payload)).toBe(false);
  });

  it('allows numerals that sit inside string values such as card names and dates', () => {
    const rohan = scenario('rohan').payload;

    expect(isGrounded('Kotak 811 is overdue.', rohan)).toBe(true);
    expect(isGrounded('Pay by 21 Oct.', rohan)).toBe(true);
  });
});
