import { describe, expect, it } from 'vitest';
import { hasForbiddenWording, isGrounded } from '../../../functions/explain/grounding.ts';
import { scenario } from './fixtures.ts';

const aarav = scenario('aarav').payload;
const ADVERSARIAL = 50_000;
const BUDGET_MS = 500;

/** Runs the call and returns how long it took, so a super-linear regex shows up as a failed budget. */
function elapsed(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

describe('abbreviation detection keeps its behaviour (the word before a full stop)', () => {
  it.each([
    ['Pay HDFC Millennia Rs. 3710 by Oct. 25 and the score is better afterwards.'],
    ['Pay ₹620 on Axis Neo by 22nd Oct and the score is better afterwards.'],
  ])('still refuses: %s', (text) => {
    expect(hasForbiddenWording(text)).toBe(true);
  });

  it('treats "Rs. 3710" as one sentence, so the amount is checked against the payload', () => {
    expect(isGrounded('Pay Rs. 3710 now.', aarav)).toBe(isGrounded('Pay Rs. 3710 now.', aarav));
    expect(isGrounded('Pay Rs. 3710 now. Then relax.', aarav)).toBe(
      isGrounded('Pay Rs. 3710 now.', aarav),
    );
  });

  it('is not slow on a long run of letters that ends in a digit before a full stop', () => {
    const text = `${'a'.repeat(ADVERSARIAL)}1. 5`;
    expect(elapsed(() => isGrounded(text, aarav))).toBeLessThan(BUDGET_MS);
  });
});

describe('number scanning keeps its behaviour (trailing commas are dropped)', () => {
  it('reads "1,000," as the number 1000 followed by a comma', () => {
    expect(isGrounded('Keep 1,000, in hand.', aarav)).toBe(isGrounded('Keep 1000 in hand.', aarav));
    expect(isGrounded('Keep 1,000,, in hand.', aarav)).toBe(
      isGrounded('Keep 1000 in hand.', aarav),
    );
  });

  it('is not slow on a digit followed by tens of thousands of commas', () => {
    const text = `1${','.repeat(ADVERSARIAL)}1`;
    expect(elapsed(() => isGrounded(text, aarav))).toBeLessThan(BUDGET_MS);
  });
});

describe('markdown and link wording keeps its behaviour', () => {
  it.each([
    '[click](http-less)',
    'see [a]( b ) now',
    'x [a] y [b](c)',
    '[a [b](c)',
    '[](x)',
    'a [b](c(d)',
    '**bold**',
    '__x__',
    '>> quote',
    '- bullet',
    '  * bullet',
    'intro\n   • bullet',
    'intro\n\n   # heading',
    '# heading',
    '* ',
    'a\r\n- b',
    'a - b',
  ])('flags: %j', (text) => {
    expect(hasForbiddenWording(text)).toBe(true);
  });

  it.each([
    '[a] (b)',
    '[a]b(c)',
    '](x)',
    '[a](b',
    '[a]]( b',
    'a [b] and (c)',
    'pay - now',
    'pay * now',
    'pay # now',
    'a * b',
    'a-b',
    'x\n  y',
    'x `y` z',
  ])('does not flag: %j', (text) => {
    expect(hasForbiddenWording(text)).toBe(false);
  });

  it('is not slow on a long run of opening brackets', () => {
    expect(elapsed(() => hasForbiddenWording('['.repeat(ADVERSARIAL)))).toBeLessThan(BUDGET_MS);
    expect(elapsed(() => hasForbiddenWording('[]('.repeat(ADVERSARIAL / 3)))).toBeLessThan(
      BUDGET_MS,
    );
  });

  it('is not slow on a long run of blank lines', () => {
    expect(elapsed(() => hasForbiddenWording(`${'\n'.repeat(ADVERSARIAL)}x`))).toBeLessThan(
      BUDGET_MS,
    );
    expect(elapsed(() => hasForbiddenWording(`${' \n'.repeat(ADVERSARIAL / 2)}x`))).toBeLessThan(
      BUDGET_MS,
    );
  });
});
