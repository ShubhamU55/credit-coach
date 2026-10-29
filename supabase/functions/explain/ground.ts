// Server-side grounding check (CLAUDE.md non-negotiable 2: the LLM never computes). Every numeral
// in the model's text must also appear among the payload's values. The app runs a second, similar
// check on its side; this one is the first line.

import type { ExplainPayload } from './payload.ts';

/** Same token shape as the app's check, so the two agree: digits with optional commas and decimals. */
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

/** Every numeral in a text, normalised: commas, currency and ordinal suffixes drop out ("22nd" is 22). */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const token of text.match(NUMBER_TOKEN) ?? []) {
    found.add(Number(token.replaceAll(',', '')));
  }
  return found;
}

function collect(value: unknown, into: Set<number>): void {
  if (typeof value === 'number') {
    into.add(value);
  } else if (typeof value === 'string') {
    // Dates ("2026-11-04") and card names ("Kotak 811") carry numerals too.
    for (const n of numbersIn(value)) into.add(n);
  } else if (Array.isArray(value)) {
    for (const entry of value) collect(entry, into);
  } else if (typeof value === 'object' && value !== null) {
    // Values only: a key such as `aimFor10` must not make "10" legal.
    for (const entry of Object.values(value)) collect(entry, into);
  }
}

/** The numbers the model may use: those among the payload's values, and nothing else. */
export function payloadNumbers(payload: ExplainPayload): Set<number> {
  const allowed = new Set<number>();
  collect(payload, allowed);
  return allowed;
}

/** True when the text uses no numeral that the payload does not contain. */
export function isGrounded(text: string, payload: ExplainPayload): boolean {
  const allowed = payloadNumbers(payload);
  for (const n of numbersIn(text)) {
    if (!allowed.has(n)) return false;
  }
  return true;
}
