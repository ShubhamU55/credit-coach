import type { DemoCard, DemoCreditHistory, DemoProfile, DemoRules, DemoSeed } from './types';

// Runtime validation for the JSON seed. A `satisfies` check cannot work here: a JSON import
// is typed with widened `string`/`number`, so it never matches the literal unions. A typo in
// aarav.json therefore fails the seed test (and the app at start) with the offending path.

type Obj = Record<string, unknown>;

function fail(path: string, expected: string): never {
  throw new Error(`Invalid demo seed at ${path}: expected ${expected}`);
}

function asObject(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'an object');
  }
  return value as Obj;
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') fail(`${path}.${key}`, 'a non-empty string');
  return v;
}

function bool(o: Obj, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') fail(`${path}.${key}`, 'a boolean');
  return v;
}

function whole(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    fail(`${path}.${key}`, 'a non-negative integer');
  }
  return v;
}

function dayOfMonth(o: Obj, key: string, path: string, nullable: boolean): number | null {
  const v = o[key];
  if (nullable && v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 31) {
    fail(`${path}.${key}`, nullable ? 'a day 1-31 or null' : 'a day 1-31');
  }
  return v;
}

function parseCard(raw: unknown, index: number): DemoCard {
  const path = `cards[${index}]`;
  const o = asObject(raw, path);
  return {
    id: str(o, 'id', path),
    name: str(o, 'name', path),
    issuer: str(o, 'issuer', path),
    initials: str(o, 'initials', path),
    ageMonths: whole(o, 'ageMonths', path),
    isSecured: bool(o, 'isSecured', path),
    limit: whole(o, 'limit', path),
    outstanding: whole(o, 'outstanding', path),
    lastStatementBalance: whole(o, 'lastStatementBalance', path),
    statementDay: dayOfMonth(o, 'statementDay', path, false) as number,
    dueDay: dayOfMonth(o, 'dueDay', path, true),
    minimumDue: whole(o, 'minimumDue', path),
    paidSinceStatement: whole(o, 'paidSinceStatement', path),
  };
}

function parseRules(raw: unknown): DemoRules {
  const o = asObject(raw, 'rules');
  const basis = o.reportingBasis;
  if (basis !== 'statement' && basis !== 'weekly_current') {
    fail('rules.reportingBasis', "'statement' or 'weekly_current'");
  }
  return {
    thresholdPct: whole(o, 'thresholdPct', 'rules'),
    excellentPct: whole(o, 'excellentPct', 'rules'),
    reportingBasis: basis,
    aimFor10: bool(o, 'aimFor10', 'rules'),
  };
}

function parseHistory(raw: unknown): DemoCreditHistory {
  const path = 'profile.history';
  const o = asObject(raw, path);
  return {
    anchorScore: whole(o, 'anchorScore', path),
    anchorDate: str(o, 'anchorDate', path),
    monthsWithZeroMissed: whole(o, 'monthsWithZeroMissed', path),
    missedPayments: whole(o, 'missedPayments', path),
    hardInquiries6m: whole(o, 'hardInquiries6m', path),
    hardInquiries12m: whole(o, 'hardInquiries12m', path),
    oldestAccountCardId: str(o, 'oldestAccountCardId', path),
    oldestAccountMonths: whole(o, 'oldestAccountMonths', path),
    securedAccounts: whole(o, 'securedAccounts', path),
    unsecuredAccounts: whole(o, 'unsecuredAccounts', path),
  };
}

function parseProfile(raw: unknown): DemoProfile {
  const o = asObject(raw, 'profile');
  return {
    id: str(o, 'id', 'profile'),
    name: str(o, 'name', 'profile'),
    firstName: str(o, 'firstName', 'profile'),
    isSample: bool(o, 'isSample', 'profile'),
    persona: str(o, 'persona', 'profile'),
    panMasked: str(o, 'panMasked', 'profile'),
    mobileMasked: str(o, 'mobileMasked', 'profile'),
    cashForCards: whole(o, 'cashForCards', 'profile'),
    history: parseHistory(o.history),
  };
}

/** Validates an untrusted seed object and returns it typed, or throws naming the bad path. */
export function parseSeed(raw: unknown): DemoSeed {
  const root = asObject(raw, 'seed');
  if (!Array.isArray(root.cards)) fail('cards', 'an array');
  const cards = root.cards.map((card, index) => parseCard(card, index));
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`Invalid demo seed: duplicate card id ${card.id}`);
    ids.add(card.id);
  }
  const profile = parseProfile(root.profile);
  if (!ids.has(profile.history.oldestAccountCardId)) {
    fail('profile.history.oldestAccountCardId', 'the id of one of the cards');
  }
  return { profile, rules: parseRules(root.rules), cards };
}
