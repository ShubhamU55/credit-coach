import aaravSeed from '../../demo/aarav.json';
import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { parseSeed } from '../../demo/seed';
import type { DemoCard } from '../../demo/types';
import { buildPlanView } from './planModel';
import {
  parsePlanParams,
  rejectedPlanParams,
  GENERIC_RECORDED_LINE,
  recordAndSummarise,
  resolveMarkPaid,
  resultLine,
  validateOther,
} from './markPaidModel';

/** Aarav's repository with one card's fields patched. */
function repoWith(cardId: string, patch: Partial<DemoCard>) {
  const seed = parseSeed(aaravSeed);
  return createDemoRepository({
    ...seed,
    cards: seed.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
  });
}

function axisOptions(repo = createDemoRepository()) {
  const { cards, view } = setup(repo);
  const r = resolveMarkPaid({ cards, view, params: { cardId: 'axis-neo' } });
  if (r.kind !== 'ok') throw new Error('expected ok');
  return r;
}

function setup(repo = createDemoRepository()) {
  const cards = repo.listCards();
  const view = buildPlanView({
    cards,
    payments: repo.listPayments(),
    rules: repo.getRules(),
    cash: 120000,
    today: DEMO_TODAY,
    aimFor10: false,
  });
  return { cards, view };
}

describe('resolveMarkPaid', () => {
  it('defaults to the primary step card (Axis Neo) with Full statement selected', () => {
    const { cards, view } = setup();
    const r = resolveMarkPaid({ cards, view, params: {} });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.card.id).toBe('axis-neo');
    expect(r.subtitle).toBe('Axis Neo · due Thu, 22 Oct');
    expect(r.defaultOption).toBe('full');
    expect(r.options.map((o) => [o.key, o.amountValue])).toEqual([
      ['full', 12400],
      ['minimum', 620],
      ['other', 0],
    ]);
    expect(r.options[0].sub).toBe('Steps 01 + 03 · zero interest');
    expect(r.options[1].sub).toBe('Step 01 · interest applies on the rest');
  });

  it('offers the planned amount for a card with nothing due (SBI)', () => {
    const { cards, view } = setup();
    const r = resolveMarkPaid({ cards, view, params: { cardId: 'sbi-simplyclick' } });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.defaultOption).toBe('planned');
    expect(r.options[0].amountValue).toBe(2400);
    expect(r.subtitle).toBe('SBI SimplyClick · nothing due this cycle');
  });

  it('rejects an unknown card', () => {
    const { cards, view } = setup();
    expect(resolveMarkPaid({ cards, view, params: { cardId: 'nope' } }).kind).toBe('invalid');
  });

  it.each(['0', '-5', 'abc', '15601', '12.5'])('ignores a bad amount param %s', (amount) => {
    const { cards, view } = setup();
    const r = resolveMarkPaid({ cards, view, params: { cardId: 'axis-neo', amount } });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.prefill).toBeNull();
    expect(r.defaultOption).toBe('full');
  });

  it('prefills a valid amount param into Other', () => {
    const { cards, view } = setup();
    const r = resolveMarkPaid({ cards, view, params: { cardId: 'axis-neo', amount: '700' } });
    if (r.kind !== 'ok') throw new Error('expected ok');
    expect(r.prefill).toBe('700');
    expect(r.defaultOption).toBe('other');
  });

  it('is invalid when nothing is owed anywhere', () => {
    const repo = createDemoRepository();
    for (const c of repo.listCards()) repo.recordPayment(c.id, c.outstanding, DEMO_TODAY);
    const { cards, view } = setup(repo);
    expect(resolveMarkPaid({ cards, view, params: {} }).kind).toBe('invalid');
  });
});

describe('validateOther', () => {
  const base = { outstanding: 15600, minimum: 620, dueLabel: '22 Oct' };
  it('errors on empty or zero', () => {
    expect(validateOther('', base).status).toBe('error');
    expect(validateOther('0', base)).toMatchObject({
      status: 'error',
      message: 'Enter the amount you paid.',
    });
  });
  it('errors above the outstanding', () => {
    expect(validateOther('15601', base).message).toBe("That's more than the ₹15,600 outstanding.");
  });
  it('warns below the minimum with Record anyway', () => {
    const v = validateOther('500', base);
    expect(v).toMatchObject({
      status: 'warning',
      isConfirmable: true,
      confirmLabel: 'Record anyway',
    });
    expect(v.message).toBe(
      '⚠ ₹120 short of the ₹620 minimum. This counts as a missed payment — pay the rest by 22 Oct.',
    );
  });
  it('is fine at or above the minimum', () => {
    expect(validateOther('620', base)).toMatchObject({
      status: 'default',
      isConfirmable: true,
      confirmLabel: 'Confirm payment',
    });
  });
});
describe('resultLine', () => {
  it('names a single step', () => {
    expect(resultLine('Axis Neo', [1], false)).toBe(
      'Step 01 is done. The plan is updated for Axis Neo.',
    );
  });
  it('joins three or more steps with commas and "and"', () => {
    expect(resultLine('Axis Neo', [1, 3, 5], true)).toBe(
      "Steps 01, 03 and 05 are done. Axis Neo's statement is cleared — no interest this cycle.",
    );
  });
  it('says only that the plan is updated when no step was settled', () => {
    expect(resultLine('Axis Neo', [], false)).toBe('The plan is updated for Axis Neo.');
  });
  it('keeps the cleared sentence when no step was settled but the statement is cleared', () => {
    expect(resultLine('Axis Neo', [], true)).toBe(
      "Axis Neo's statement is cleared — no interest this cycle.",
    );
  });
});

describe('buildOptions boundaries (through resolveMarkPaid)', () => {
  it('omits Minimum only when the minimum equals the statement', () => {
    const r = axisOptions(repoWith('axis-neo', { minimumDue: 12400 }));
    expect(r.options.map((o) => o.key)).toEqual(['full', 'other']);
  });

  it('shrinks both options after a partial payment on the statement', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 500, DEMO_TODAY);
    const r = axisOptions(repo);
    expect(r.options.map((o) => [o.key, o.amountValue, o.sub])).toEqual([
      ['full', 11900, 'Steps 01 + 03 · zero interest'],
      ['minimum', 120, 'Step 01 · interest applies on the rest'],
      ['other', 0, 'Partial payment'],
    ]);
  });

  it('offers only Other when the statement is paid in full and no step is open', () => {
    const repo = createDemoRepository();
    repo.recordPayment('axis-neo', 12400, DEMO_TODAY);
    const r = axisOptions(repo);
    expect(r.options.map((o) => o.key)).toEqual(['other']);
    expect(r.defaultOption).toBe('other');
  });

  it('counts a step when the amount equals the running step total exactly', () => {
    // Statement 12,400 = step 01 (620) + step 03 (11,780); minimum 620 = step 01.
    const r = axisOptions();
    expect(r.options[0].sub).toBe('Steps 01 + 03 · zero interest');
    expect(r.options[1].sub).toBe('Step 01 · interest applies on the rest');
  });
});

describe('parsePlanParams', () => {
  const stored = { aimFor10: false, cash: 120000 };
  it.each([
    ['0', 0],
    ['1', 1],
    ['999999999', 999999999],
  ])('accepts cash %s', (cash, expected) => {
    expect(parsePlanParams({ cash }, stored).cash).toBe(expected);
  });
  it.each(['1000000000', '012', '-5', '1.5', '', 'abc'])('rejects cash %j', (cash) => {
    expect(parsePlanParams({ cash }, stored).cash).toBe(120000);
  });
  it('lets aim10 "0" override a stored aimFor10 of true', () => {
    expect(parsePlanParams({ aim10: '0' }, { aimFor10: true, cash: 1 }).aimFor10).toBe(false);
  });
  it('uses the stored aimFor10 for an absent or unknown aim10, and "1" always wins', () => {
    expect(parsePlanParams({}, { aimFor10: true, cash: 1 }).aimFor10).toBe(true);
    expect(parsePlanParams({ aim10: 'x' }, { aimFor10: true, cash: 1 }).aimFor10).toBe(true);
    expect(parsePlanParams({ aim10: '1' }, stored).aimFor10).toBe(true);
  });
});

describe('rejectedPlanParams', () => {
  it('lists only the params that are present and unusable', () => {
    expect(rejectedPlanParams({})).toEqual([]);
    expect(rejectedPlanParams({ aim10: '0', cash: '5' })).toEqual([]);
    expect(rejectedPlanParams({ aim10: 'x', cash: '012' })).toEqual(['aim10', 'cash']);
  });
});

describe('recordAndSummarise', () => {
  function args(repository: ReturnType<typeof createDemoRepository>) {
    const { cards, view } = setup(repository);
    const card = cards.find((c) => c.id === 'axis-neo');
    if (!card) throw new Error('axis-neo missing');
    return {
      repository,
      card,
      amount: 620,
      today: DEMO_TODAY,
      cash: 20000,
      aimFor10: false,
      before: view,
    };
  }

  it('records once and returns a generic line when the summary throws after the write', () => {
    const repository = createDemoRepository();
    const input = args(repository);
    jest.spyOn(repository, 'listCards').mockImplementation(() => {
      throw new Error('read failed');
    });
    jest.spyOn(console, 'warn').mockImplementation();

    const summary = recordAndSummarise(input);

    expect(repository.listPayments()).toHaveLength(1);
    expect(summary).toEqual({ amount: 620, line: GENERIC_RECORDED_LINE });
  });

  it('treats a missing card after a successful write as inconsistent: generic line, dev warning', () => {
    const repository = createDemoRepository();
    const input = args(repository);
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const real = repository.listCards.bind(repository);
    let calls = 0;
    jest.spyOn(repository, 'listCards').mockImplementation(() => {
      calls += 1;
      // The first read feeds the plan view; the lookup of the updated card then finds nothing.
      return calls === 1 ? real() : real().filter((c) => c.id !== 'axis-neo');
    });

    const summary = recordAndSummarise(input);

    expect(repository.listPayments()).toHaveLength(1);
    expect(summary.line).toBe(GENERIC_RECORDED_LINE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('axis-neo'));
  });

  it('lets a repository rejection of the write propagate', () => {
    const repository = createDemoRepository();
    const input = args(repository);

    expect(() => recordAndSummarise({ ...input, amount: 99999999 })).toThrow();
    expect(repository.listPayments()).toHaveLength(0);
  });
});
