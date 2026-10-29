import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { buildPlanView } from './planModel';
import { resolveMarkPaid, validateOther } from './markPaidModel';

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
    expect(v).toMatchObject({ status: 'warning', canConfirm: true, confirmLabel: 'Record anyway' });
    expect(v.message).toBe(
      '⚠ ₹120 short of the ₹620 minimum. This counts as a missed payment — pay the rest by 22 Oct.',
    );
  });
  it('is fine at or above the minimum', () => {
    expect(validateOther('620', base)).toMatchObject({
      status: 'default',
      canConfirm: true,
      confirmLabel: 'Confirm payment',
    });
  });
});
