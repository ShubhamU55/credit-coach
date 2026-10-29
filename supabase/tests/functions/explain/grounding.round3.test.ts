import { describe, expect, it } from 'vitest';
import { hasForbiddenWording, isAcceptableAiText } from '../../../functions/explain/grounding.ts';
import { scenario } from './fixtures.ts';

const aarav = scenario('aarav').payload;

describe('advice to close or drop a card is refused (non-negotiable 4)', () => {
  it.each([
    'Close it.',
    'Closing them helps.',
    'Pay off and close it for good.',
    'Once paid you can close it.',
    'Drop the SBI SimplyClick card.',
    'Drop SBI SimplyClick.',
    'Ditch the old card.',
    'Think about retiring HDFC Millennia afterwards.',
    'You could retire that account.',
    'Pay HDFC Millennia Rs. 3710 by Oct. 25 and the score is better afterwards.',
    'Your score gains from this.',
    'Pay ₹620 on Axis Neo by 22nd Oct and the score is better afterwards.',
    'This gives your score a boost.',
  ])('refuses: %s', (text) => {
    expect(isAcceptableAiText(text, aarav)).toBe(false);
  });

  it.each([
    'Pay the minimum on SBI SimplyClick by Oct. 22.',
    'Pay before your statement closes this week.',
    'Pay before the window closes this month.',
    'Your highest card is close to the 30% threshold.',
    'Utilization should drop to 15.3% once the statement is paid.',
    'Pay Axis Neo first, then HDFC Millennia.',
    'A missed payment hurts the most.',
  ])('still allows: %s', (text) => {
    expect(hasForbiddenWording(text)).toBe(false);
  });

  it('accepts the harmless minimum sentence end to end', () => {
    expect(isAcceptableAiText('Pay ₹620 on Axis Neo by 22nd Oct.', aarav)).toBe(true);
  });
});

describe('number words that cannot be checked', () => {
  it.each([
    'Pay zero on Axis Neo.',
    'Pay half of it.',
    'Pay twice the minimum.',
    'Pay double the amount.',
  ])('refuses: %s', (text) => {
    expect(isAcceptableAiText(text, aarav)).toBe(false);
  });

  // Ruling: first/second/third are NOT blocked. "First, pay..." is ordinary plan wording and an
  // ordinal word names a position, not an amount, date or percent.
  it('does not block ordinal words', () => {
    expect(hasForbiddenWording('First, pay Axis Neo. Second, pay HDFC Millennia.')).toBe(false);
  });
});

describe('abbreviation handling, with cases that prove something', () => {
  it('keeps "Nov. 3710" attached to its card, so the HDFC amount on Axis is refused', () => {
    expect(isAcceptableAiText('Pay on Axis Neo by Nov. 3710 is HDFC amount.', aarav)).toBe(false);
  });

  it('accepts lowercase month abbreviations before a real day', () => {
    expect(isAcceptableAiText('Pay Axis Neo by oct. 22.', aarav)).toBe(true);
  });

  it('refuses a lowercase month abbreviation before a wrong day', () => {
    expect(isAcceptableAiText('Pay Axis Neo by oct. 23.', aarav)).toBe(false);
  });
});
