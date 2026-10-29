// Grounding rules for AI-written "Why this plan?" text (CLAUDE.md non-negotiable 2: the LLM never
// computes). Pure, no imports.
//
// THIS FILE EXISTS TWICE, BYTE FOR BYTE: supabase/functions/explain/grounding.ts (the server, the first
// line of defence) and apps/mobile/src/explain/grounding.ts (the app, the second). An Edge Function
// bundles only its own folder, so it is a copy; supabase/tests/functions/explain/grounding.parity.test.ts
// fails if the two ever differ. Change both together.
//
// A number in the text is accepted only if it is the right KIND of number and is in the payload:
//   money    (after a rupee sign, or before "rupees")  -> an amount of the card named in the same sentence
//                                                         (any card's amount when no card is named), or the
//                                                         cash used / left over
//   percent  (followed by %)                           -> a utilization or the threshold, nothing else
//   date     (next to a month name)                    -> a (day, month) pair that is a date in the payload
//   ordinal  (22nd)                                    -> the day of a date in the payload
//   bare                                               -> an amount, or a step number 1..N
// Digits inside a card name ("Kotak 811") are part of the name. So a day-of-month never legitimises a
// percent or an amount, and an amount never legitimises a percent. What is NOT caught: swapping two
// amounts between two cards named in the same sentence (template-style lists name several cards).

export interface GroundingPayload {
  today: string;
  thresholdPct: number;
  items: readonly {
    card: string;
    amount: number;
    payBy: string;
    utilizationBefore: number | null;
    utilizationAfter: number | null;
  }[];
  shortfalls: readonly {
    card: string;
    required: number;
    funded: number;
    shortfall: number;
    dueDate: string;
  }[];
  cashUsed: number;
  leftover: number;
  overallUtilizationBefore: number | null;
  overallUtilizationAfter: number | null;
  highestCardBefore: number | null;
  highestCardAfter: number | null;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** 1..12 for "Oct", "october", "Sept"; 0 when the word is not a month. */
function monthNumber(word: string): number {
  const w = word.toLowerCase();
  const index = MONTH_NAMES.findIndex((name) => name === w || name.slice(0, 3) === w);
  return w === 'sept' ? 9 : index + 1;
}

interface CardFacts {
  name: string;
  amounts: Set<number>;
}

interface Facts {
  cards: CardFacts[];
  allAmounts: Set<number>;
  globalAmounts: Set<number>;
  percents: Set<number>;
  dates: Set<string>;
  days: Set<number>;
  steps: Set<number>;
}

function addDate(facts: Facts, iso: string): void {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  facts.dates.add(`${day}-${month}`);
  facts.days.add(day);
}

function cardFacts(facts: Facts, name: string): CardFacts {
  const found = facts.cards.find((c) => c.name === name);
  if (found) return found;
  const created = { name, amounts: new Set<number>() };
  facts.cards.push(created);
  return created;
}

function collectFacts(payload: GroundingPayload): Facts {
  const facts: Facts = {
    cards: [],
    allAmounts: new Set(),
    globalAmounts: new Set([payload.cashUsed, payload.leftover]),
    percents: new Set([payload.thresholdPct]),
    dates: new Set(),
    days: new Set(),
    steps: new Set(),
  };
  addDate(facts, payload.today);
  payload.items.forEach((item, index) => {
    cardFacts(facts, item.card).amounts.add(item.amount);
    addDate(facts, item.payBy);
    facts.steps.add(index + 1);
    for (const p of [item.utilizationBefore, item.utilizationAfter]) {
      if (p !== null) facts.percents.add(p);
    }
  });
  for (const s of payload.shortfalls) {
    const card = cardFacts(facts, s.card);
    for (const n of [s.required, s.funded, s.shortfall]) card.amounts.add(n);
    addDate(facts, s.dueDate);
  }
  for (const p of [
    payload.overallUtilizationBefore,
    payload.overallUtilizationAfter,
    payload.highestCardBefore,
    payload.highestCardAfter,
  ]) {
    if (p !== null) facts.percents.add(p);
  }
  for (const card of facts.cards) card.amounts.forEach((n) => facts.allAmounts.add(n));
  facts.globalAmounts.forEach((n) => facts.allAmounts.add(n));
  return facts;
}

/** Splits at . ! ? followed by whitespace (or the end); decimals like 15.3 stay whole. */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if ((ch === '.' || ch === '!' || ch === '?') && (next === '' || /\s/.test(next))) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** The cards named in a sentence (longest names first), and the sentence with those names removed. */
function namedCards(sentence: string, facts: Facts): { named: CardFacts[]; rest: string } {
  const byLength = [...facts.cards].sort((a, b) => b.name.length - a.name.length);
  const named: CardFacts[] = [];
  let rest = sentence;
  for (const card of byLength) {
    if (rest.includes(card.name)) {
      named.push(card);
      rest = rest.split(card.name).join(' ');
    }
  }
  return { named, rest };
}

const MONEY_BEFORE = /(?:₹|\bRs\.?|\bINR)\s*$/i;
const MONEY_AFTER = /^\s*(?:rupees?\b|rs\b)/i;
const PERCENT_AFTER = /^\s?(?:%|percent\b|per cent\b)/i;
const ORDINAL_AFTER = /^(?:st|nd|rd|th)\b/i;
const MONTH_AFTER = /^\s+([A-Za-z]{3,9})\b/;
const MONTH_BEFORE = /\b([A-Za-z]{3,9})\.?\s+$/;

function monthAround(before: string, afterOrdinalless: string): number {
  const after = MONTH_AFTER.exec(afterOrdinalless);
  const afterMonth = after?.[1] ? monthNumber(after[1]) : 0;
  if (afterMonth > 0) return afterMonth;
  const prior = MONTH_BEFORE.exec(before);
  return prior?.[1] ? monthNumber(prior[1]) : 0;
}

function tokenOk(
  facts: Facts,
  value: number,
  context: { before: string; after: string },
  named: CardFacts[],
): boolean {
  const { before, after } = context;
  if (PERCENT_AFTER.test(after)) return facts.percents.has(value);
  if (MONEY_BEFORE.test(before) || MONEY_AFTER.test(after)) {
    if (facts.globalAmounts.has(value)) return true;
    if (named.length === 0) return facts.allAmounts.has(value);
    return named.some((card) => card.amounts.has(value));
  }
  const ordinal = ORDINAL_AFTER.test(after);
  const month = monthAround(before, ordinal ? after.replace(ORDINAL_AFTER, '') : after);
  if (month > 0) return facts.dates.has(`${value}-${month}`);
  if (ordinal) return facts.days.has(value);
  return facts.allAmounts.has(value) || facts.steps.has(value);
}

function sentenceGrounded(sentence: string, facts: Facts): boolean {
  const { named, rest } = namedCards(sentence, facts);
  for (const match of rest.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = match[0];
    const value = Number(raw.replace(/,+$/, '').split(',').join(''));
    const start = match.index ?? 0;
    const context = { before: rest.slice(0, start), after: rest.slice(start + raw.length) };
    if (!Number.isFinite(value) || !tokenOk(facts, value, context, named)) return false;
  }
  return true;
}

/** True when every number in the text is the right kind of number and is in the payload. */
export function isGrounded(text: string, payload: GroundingPayload): boolean {
  const facts = collectFacts(payload);
  return sentencesOf(text).every((sentence) => sentenceGrounded(sentence, facts));
}

const SPELLED_NUMBERS =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|' +
  'seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|' +
  'thousand|lakhs?|crores?|millions?|billions?|dozen';
const SCORE_CLAIM =
  'will|would|could|might|may|should|reach(?:es|ed)?|hit|hits|jump(?:s|ed)?|rise|rises|climb(?:s|ed)?|boost(?:s|ed)?|predict(?:s|ed|ion)?|expect(?:s|ed)?';

/** Wording a short plan note must never contain, whatever the numbers say. Each hit means "use the template". */
const FORBIDDEN: readonly RegExp[] = [
  // A score claim: "your score could reach...", "this will lift your score".
  new RegExp(`\\bscores?\\b[^.!?]*\\b(?:${SCORE_CLAIM})\\b`, 'i'),
  new RegExp(`\\b(?:${SCORE_CLAIM})\\b[^.!?]*\\bscores?\\b`, 'i'),
  new RegExp(`\\bcibil\\b[^.!?]*\\b\\d`, 'i'),
  // Advice to close a card (non-negotiable 4 needs a warning the note cannot give).
  /\b(?:clos(?:e|es|ed|ing)|cancel(?:s|led|ling|ing)?)\b/i,
  /\bguarantee(?:s|d)?\b/i,
  // Numbers spelled out in words cannot be checked against the payload.
  new RegExp(`\\b(?:${SPELLED_NUMBERS})\\b`, 'i'),
  // Links and markdown.
  /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|in|org|net|io|co|app|me)\b/i,
  /\[[^\]]*\]\([^)]*\)/,
  /[`*_#>]{2,}|^\s*[-*•]\s|^\s*#/m,
];

/** True when the text contains wording that must not reach the user. */
export function hasForbiddenWording(text: string): boolean {
  return FORBIDDEN.some((pattern) => pattern.test(text));
}

/**
 * Both checks: grounded numbers and clean wording. Card names are taken out before the wording
 * check, so a card called "One Card" is not mistaken for a spelled-out number.
 */
export function isAcceptableAiText(text: string, payload: GroundingPayload): boolean {
  const withoutNames = namedCards(text, collectFacts(payload)).rest;
  return !hasForbiddenWording(withoutNames) && isGrounded(text, payload);
}
