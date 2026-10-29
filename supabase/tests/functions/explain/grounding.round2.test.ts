import { describe, expect, it } from 'vitest';
import {
  hasForbiddenWording,
  isAcceptableAiText,
  isGrounded,
} from '../../../functions/explain/grounding.ts';
import { scenario } from './fixtures.ts';

const aarav = scenario('aarav').payload;

describe('digits are ASCII only', () => {
  it.each([
    ['Devanagari amount', 'Pay ₹६२० on Axis Neo.'],
    ['fullwidth amount', 'Pay ₹９９９ on Axis Neo.'],
    ['Arabic-Indic percent', 'Utilization falls to ٩٩%.'],
    ['Devanagari day', 'Pay by २२ Oct.'],
    ['superscript', 'Pay ₹620² on Axis Neo.'],
    ['vulgar fraction', 'Pay ½ now.'],
    ['mixed ASCII and Devanagari', 'Pay ₹6२0 on Axis Neo.'],
  ])('rejects %s', (_name, text) => {
    expect(isGrounded(text, aarav)).toBe(false);
    expect(isAcceptableAiText(text, aarav)).toBe(false);
  });

  it('still accepts ASCII digits, and Devanagari digits inside a card name', () => {
    expect(isGrounded('Pay ₹620 on Axis Neo.', aarav)).toBe(true);
    const payload = structuredClone(aarav);
    payload.items[0]!.card = 'कार्ड ८११';

    expect(isGrounded('Pay ₹620 on कार्ड ८११ by 22nd Oct.', payload)).toBe(true);
    expect(isGrounded('Pay ₹६२० on कार्ड ८११.', payload)).toBe(false);
  });
});

describe('abbreviations do not end a sentence before a number', () => {
  it.each([
    'Pay Rs. 3710 on Axis Neo.',
    'Pay Rs 3710 on Axis Neo.',
    'Pay Rs.3710 on Axis Neo.',
    'Pay INR 3710 on Axis Neo.',
    'Pay ₹ 3710 on Axis Neo.',
    'Pay inr. 3710 on Axis Neo.',
    'Pay rs. 3710 on Axis Neo.',
    'Pay 3710 rupees on Axis Neo.',
  ])("rejects HDFC's amount on Axis: %s", (text) => {
    expect(isGrounded(text, aarav)).toBe(false);
  });

  it('accepts the right amount in the same spellings', () => {
    for (const text of [
      'Pay Rs. 620 on Axis Neo.',
      'Pay Rs 620 on Axis Neo.',
      'Pay INR 620 on Axis Neo.',
      'Pay ₹ 620 on Axis Neo.',
    ]) {
      expect(isGrounded(text, aarav)).toBe(true);
    }
  });

  it('does not let an abbreviation before a number merge two sentences, nor a month before a day', () => {
    // "No. 5" and "Oct. 22" stay in one sentence...
    expect(isGrounded('Step No. 2 is the HDFC Millennia minimum.', aarav)).toBe(true);
    expect(isGrounded('Pay by Oct. 22 on Axis Neo.', aarav)).toBe(true);
    // ...but a month that ends a sentence still splits, so the next sentence binds to its own card.
    expect(isGrounded('Pay ₹620 on Axis Neo by 22 Oct. Pay ₹70,490 on Axis Neo.', aarav)).toBe(
      false,
    );
    expect(
      isGrounded('Pay ₹620 on Axis Neo by 22 Oct. Pay ₹70,490 on HDFC Millennia.', aarav),
    ).toBe(true);
  });
});

describe('more forbidden wording (non-negotiables 3 and 4)', () => {
  it.each([
    'You could shut down the SBI card.',
    'Shutting down that account is an option.',
    'Consider the closure of the Axis card.',
    'You should terminate the card.',
    'Terminating the account saves the fee.',
    'Discontinue the SBI card.',
    'Surrender the card to the bank.',
    'Stop using the HDFC card.',
    'Get rid of the SBI card.',
    'You can get rid of an account you do not use.',
    'This will lift your credit score.',
    'Paying now will raise your score.',
    'It should improve your score.',
    'Your score will increase.',
    'Your score goes up after this.',
    'Closing the SBI SimplyClick card helps.',
    'Close the card.',
    'Closing the account helps.',
    'Close your SBI account.',
    'Closing SBI SimplyClick helps.',
  ])('flags: %s', (text) => {
    expect(isAcceptableAiText(text, aarav)).toBe(false);
  });

  it('flags a close-the-card sentence that names the card, once names are taken out', () => {
    expect(isAcceptableAiText('Closing SBI SimplyClick would help.', aarav)).toBe(false);
    expect(isAcceptableAiText('Close Axis Neo.', aarav)).toBe(false);
  });

  it.each([
    'Pay before your statement closes.',
    'Pay before your statement closes on 15 Nov.',
    'Your highest card is close to the 30% threshold.',
    'The window closes soon, so pay ₹620 first.',
    'That brings it close to the target.',
  ])('does not over-block the harmless use: %s', (text) => {
    expect(hasForbiddenWording(text)).toBe(false);
  });
});
