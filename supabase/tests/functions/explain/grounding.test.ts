import { describe, expect, it } from 'vitest';
import {
  hasForbiddenWording,
  isAcceptableAiText,
  isGrounded,
} from '../../../functions/explain/grounding.ts';
import { templateFromPayload } from '../../../functions/explain/template.ts';
import { scenario } from './fixtures.ts';

const aarav = scenario('aarav').payload;
const rohan = scenario('rohan').payload;

describe('isGrounded: the engine template always passes', () => {
  it.each([
    ['aarav', {}],
    ['aarav', { rules: { aimFor10: true } }],
    ['aarav', { rules: { thresholdPct: 20 } }],
    ['aarav', { cash: 0 }],
    ['rohan', {}],
    ['rohan', { cash: 60000 }],
    ['ishita', {}],
  ])('%s %j', (slug, options) => {
    const { payload } = scenario(slug, options);
    const text = templateFromPayload(payload);

    expect(isGrounded(text, payload)).toBe(true);
    expect(isAcceptableAiText(text, payload)).toBe(true);
  });
});

describe('isGrounded: right number, right kind', () => {
  it('accepts a faithful rewording with commas, ordinals and a month', () => {
    const text =
      'Pay ₹620 on Axis Neo by 22nd Oct, then ₹3,710 on HDFC Millennia by Wed, 4 Nov. Overall utilization goes from 45.0% to 15.3%, and ₹31,000 is left over.';

    expect(isGrounded(text, aarav)).toBe(true);
  });

  it('accepts text with no numbers', () => {
    expect(isGrounded('Minimums come first, then full statements.', aarav)).toBe(true);
  });

  it('rejects a number that is nowhere in the payload', () => {
    expect(isGrounded('Pay ₹12,400 on Axis Neo.', aarav)).toBe(false);
    expect(isGrounded('Utilization falls to 12.5%.', aarav)).toBe(false);
  });

  it('rejects an amount swapped onto the wrong card', () => {
    expect(isGrounded('Pay ₹70,490 on Axis Neo by 22nd Oct.', aarav)).toBe(false);
    expect(isGrounded('Pay ₹11,780 on HDFC Millennia.', aarav)).toBe(false);
    expect(isGrounded('Pay ₹11,780 on Axis Neo.', aarav)).toBe(true);
  });

  it('does not let date digits legitimise a percent: 21% and 11% come from dates only', () => {
    expect(isGrounded('Utilization falls to 21%.', aarav)).toBe(false);
    expect(isGrounded('Utilization falls to 11%.', aarav)).toBe(false);
  });

  it('does not let a percent or a day legitimise an amount', () => {
    expect(isGrounded('Pay ₹30 on Axis Neo.', aarav)).toBe(false);
    expect(isGrounded('Pay ₹22 on Axis Neo.', aarav)).toBe(false);
    expect(isGrounded('Pay ₹45 now.', aarav)).toBe(false);
  });

  it('does not let an amount legitimise a percent', () => {
    expect(isGrounded('Utilization falls to 620%.', aarav)).toBe(false);
  });

  it('checks a date as a day plus a month, not just the day', () => {
    expect(isGrounded('Pay by 22 Oct.', aarav)).toBe(true);
    expect(isGrounded('Pay by 22 Nov.', aarav)).toBe(false);
    expect(isGrounded('Pay by Oct 22.', aarav)).toBe(true);
    expect(isGrounded('Pay by 23 Oct.', aarav)).toBe(false);
    expect(isGrounded('Pay by the 4th.', aarav)).toBe(true);
    expect(isGrounded('Pay by the 5th.', aarav)).toBe(false);
  });

  it('treats digits in a card name as part of the name', () => {
    expect(isGrounded('Kotak 811 is overdue; pay ₹1,450 on Kotak 811.', rohan)).toBe(true);
    // 811 on its own is not a payload number.
    expect(isGrounded('Pay ₹811 now.', rohan)).toBe(false);
    expect(isGrounded('Pay 811 now.', rohan)).toBe(false);
  });

  it('rejects bare numbers that are neither an amount nor a step', () => {
    expect(isGrounded('You have 7 cards.', aarav)).toBe(false);
    expect(isGrounded('In 2026 you pay.', aarav)).toBe(false);
    expect(isGrounded('Step 2 is the HDFC minimum.', aarav)).toBe(true);
    expect(isGrounded('Step 9 is next.', aarav)).toBe(false);
  });

  it('accepts a percent word and a rupee word', () => {
    expect(isGrounded('Utilization goes to 15.3 percent.', aarav)).toBe(true);
    expect(isGrounded('Pay 620 rupees on Axis Neo.', aarav)).toBe(true);
    expect(isGrounded('Pay 621 rupees on Axis Neo.', aarav)).toBe(false);
  });

  it('keeps decimals whole across sentence ends', () => {
    expect(isGrounded('It falls from 45.0% to 15.3%. Then ₹31,000 is left.', aarav)).toBe(true);
  });
});

describe('hasForbiddenWording', () => {
  it.each([
    'Your score will reach 750 after this.',
    'You could hit a higher score.',
    'This should lift your score.',
    'A jump in your score is likely.',
    'Your CIBIL goes to 750.',
    'Closing the SBI card helps.',
    'Consider closing the SBI card.',
    'You can cancel the Axis card.',
    'This is guaranteed to help.',
    'We guarantee a better outcome.',
    'Pay seven hundred fifty rupees.',
    'Pay twenty five thousand.',
    'That is a lakh and a half.',
    'Pay one crore.',
    'See https://example.com for details.',
    'Visit www.example.in now.',
    'Read [more](http://x.y) here.',
    '**Pay** the minimum first.',
    '- Pay the minimum first.',
    '# Your plan',
  ])('flags: %s', (text) => {
    expect(hasForbiddenWording(text)).toBe(true);
  });

  it.each([
    'A missed payment hurts your score the most.',
    'Minimums come first, then the full statements.',
    'Paying in full means no interest.',
    'A lower balance gets reported to the bureau.',
  ])('allows: %s', (text) => {
    expect(hasForbiddenWording(text)).toBe(false);
  });

  it('takes card names out first, so "One Card" is not a spelled-out number', () => {
    const payload = structuredClone(aarav);
    payload.items[0]!.card = 'One Card';

    expect(isAcceptableAiText('Pay ₹620 on One Card by 22nd Oct.', payload)).toBe(true);
    expect(isAcceptableAiText('Pay one amount on One Card.', payload)).toBe(false);
  });
});

describe('isAcceptableAiText: the spec cases together', () => {
  it('rejects "seven hundred fifty", a closing suggestion and a swapped amount', () => {
    expect(isAcceptableAiText('You could reach seven hundred fifty.', aarav)).toBe(false);
    expect(
      isAcceptableAiText('Closing the SBI SimplyClick card would lower your limit.', aarav),
    ).toBe(false);
    expect(isAcceptableAiText('Pay ₹70,490 on Axis Neo.', aarav)).toBe(false);
  });
});
