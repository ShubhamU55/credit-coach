import { formatINR, formatShortDate } from '@credit-coach/engine';

import type { DemoCard, DemoRepository, IsoDate } from '../../demo/types';
import { MAX_CASH, buildPlanView, shortDayMonth, type PlanView, type StepView } from './planModel';

export type OptionKey = 'full' | 'minimum' | 'planned' | 'other';

export interface SheetOption {
  key: OptionKey;
  label: string;
  sub: string;
  amountValue: number;
  amount: string;
}

export interface MarkPaidParams {
  cardId?: string;
  amount?: string;
  /** '1' or '0': the Plan screen's "Aim for 10%" switch. Anything else means the stored rules. */
  aim10?: string;
  /** Whole rupees: the Plan screen's cash figure. Anything else means the stored cash. */
  cash?: string;
}

/** The plan inputs the sheet shares with the Plan screen, validated (deep-link params are untrusted). */
export function parsePlanParams(
  params: MarkPaidParams,
  stored: { aimFor10: boolean; cash: number },
): { aimFor10: boolean; cash: number } {
  const aimFor10 = params.aim10 === '1' || (params.aim10 !== '0' && stored.aimFor10);
  const cash = isValidCash(params.cash) ? Number(params.cash) : stored.cash;
  return { aimFor10, cash };
}

const isValidCash = (text: string | undefined): text is string =>
  text !== undefined && /^(0|[1-9]\d*)$/.test(text) && Number(text) <= MAX_CASH;

/** The plan params that were given but are not usable (so the stored values apply). */
export function rejectedPlanParams(params: MarkPaidParams): Array<'aim10' | 'cash'> {
  const rejected: Array<'aim10' | 'cash'> = [];
  if (params.aim10 !== undefined && params.aim10 !== '0' && params.aim10 !== '1') {
    rejected.push('aim10');
  }
  if (params.cash !== undefined && !isValidCash(params.cash)) rejected.push('cash');
  return rejected;
}

export type Resolved =
  | { kind: 'invalid'; title: string; message: string }
  | {
      kind: 'ok';
      card: DemoCard;
      subtitle: string;
      options: SheetOption[];
      defaultOption: OptionKey;
      /** A validated amount from the route params (digits), or null. Only ever prefilled. */
      prefill: string | null;
      outstanding: number;
      minimum: number;
      dueLabel: string;
    };

const pad = (n: number): string => String(n).padStart(2, '0');

/** `[1, 3]` -> `Steps 01 + 03`; `[1]` -> `Step 01`; none -> the fallback. */
function stepsLabel(steps: StepView[], fallback: string): string {
  if (steps.length === 0) return fallback;
  return `${steps.length === 1 ? 'Step' : 'Steps'} ${steps.map((s) => pad(s.step)).join(' + ')}`;
}

/** The open steps of a card that a payment of `amount` would fully settle, in order. */
function stepsCovered(open: StepView[], amount: number): StepView[] {
  const covered: StepView[] = [];
  let running = 0;
  for (const step of open) {
    running += step.amount;
    if (running > amount) break;
    covered.push(step);
  }
  return covered;
}

const isPositiveWhole = (text: string | undefined): text is string =>
  text !== undefined && /^[1-9]\d{0,8}$/.test(text);

function makeOption(key: OptionKey, label: string, sub: string, amountValue: number): SheetOption {
  return { key, label, sub, amountValue, amount: amountValue > 0 ? formatINR(amountValue) : '' };
}

function buildOptions(card: DemoCard, open: StepView[]): SheetOption[] {
  const remainingStatement = Math.min(
    card.outstanding,
    Math.max(0, card.lastStatementBalance - card.paidSinceStatement),
  );
  const remainingMinimum = Math.min(
    card.outstanding,
    Math.max(0, card.minimumDue - card.paidSinceStatement),
  );
  const options: SheetOption[] = [];
  if (remainingStatement > 0) {
    const fullSteps = stepsCovered(open, remainingStatement);
    options.push(
      makeOption(
        'full',
        'Full statement',
        `${stepsLabel(fullSteps, 'Statement')} · zero interest`,
        remainingStatement,
      ),
    );
    if (remainingMinimum > 0 && remainingMinimum < remainingStatement) {
      const minSteps = stepsCovered(open, remainingMinimum);
      options.push(
        makeOption(
          'minimum',
          'Minimum only',
          `${stepsLabel(minSteps, 'Minimum')} · interest applies on the rest`,
          remainingMinimum,
        ),
      );
    }
  } else if (open.length > 0) {
    const planned = open.reduce((total, s) => total + s.amount, 0);
    options.push(
      makeOption(
        'planned',
        'Planned amount',
        stepsLabel(open, 'Plan'),
        Math.min(planned, card.outstanding),
      ),
    );
  }
  options.push(makeOption('other', 'Other amount', 'Partial payment', 0));
  return options;
}

/**
 * Works out what the sheet shows from the route params and the repository's current state.
 * Never records anything. A bad card is `invalid`; a bad amount is ignored (never prefilled).
 */
export function resolveMarkPaid(args: {
  cards: readonly DemoCard[];
  view: PlanView;
  params: MarkPaidParams;
}): Resolved {
  const { cards, view, params } = args;
  const cardId = params.cardId ?? view.steps.find((s) => s.state === 'primary')?.cardId;
  const card = cards.find((c) => c.id === cardId);
  if (!params.cardId && !card) {
    return {
      kind: 'invalid',
      title: 'All paid',
      message: 'Every step in your plan is marked paid. Nothing left to record.',
    };
  }
  if (!card || card.outstanding <= 0) {
    return {
      kind: 'invalid',
      title: 'Nothing to mark as paid',
      message: card
        ? `Nothing is outstanding on ${card.name}.`
        : "We couldn't find that card. Open Mark as paid from a step on your plan.",
    };
  }
  const open = view.steps.filter((s) => s.cardId === card.id && s.state !== 'paid');
  const options = buildOptions(card, open);
  const lane = view.lanes.find((l) => l.cardId === card.id);
  const subtitle = lane?.due
    ? `${card.name} · due ${formatShortDate(lane.due)}`
    : `${card.name} · nothing due this cycle`;
  const prefill =
    isPositiveWhole(params.amount) && Number(params.amount) <= card.outstanding
      ? params.amount
      : null;
  return {
    kind: 'ok',
    card,
    subtitle,
    options,
    defaultOption: prefill ? 'other' : options[0].key,
    prefill,
    outstanding: card.outstanding,
    minimum: Math.min(card.outstanding, Math.max(0, card.minimumDue - card.paidSinceStatement)),
    dueLabel: lane?.due ? shortDayMonth(lane.due) : '',
  };
}

/** What the sheet will record: the chosen option's amount, or the typed Other amount in rupees. */
export function chosenAmount(args: {
  selected: OptionKey;
  options: readonly SheetOption[];
  other: string;
}): number {
  const { selected, options, other } = args;
  if (selected === 'other') return Number(other || 0);
  return options.find((o) => o.key === selected)?.amountValue ?? 0;
}

export interface OtherValidation {
  status: 'default' | 'error' | 'warning';
  message?: string;
  isConfirmable: boolean;
  confirmLabel: string;
}

export function validateOther(
  digits: string,
  ctx: { outstanding: number; minimum: number; dueLabel: string },
): OtherValidation {
  const amount = digits === '' ? 0 : Number(digits);
  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      status: 'error',
      message: 'Enter the amount you paid.',
      isConfirmable: false,
      confirmLabel: 'Confirm payment',
    };
  }
  if (amount > ctx.outstanding) {
    return {
      status: 'error',
      message: `That's more than the ${formatINR(ctx.outstanding)} outstanding.`,
      isConfirmable: false,
      confirmLabel: 'Confirm payment',
    };
  }
  if (amount < ctx.minimum) {
    const by = ctx.dueLabel ? ` — pay the rest by ${ctx.dueLabel}` : '';
    return {
      status: 'warning',
      message: `⚠ ${formatINR(ctx.minimum - amount)} short of the ${formatINR(ctx.minimum)} minimum. This counts as a missed payment${by}.`,
      isConfirmable: true,
      confirmLabel: 'Record anyway',
    };
  }
  return { status: 'default', isConfirmable: true, confirmLabel: 'Confirm payment' };
}

export interface PaymentSummary {
  amount: number;
  line: string;
}

/** The sentence under "Recorded ₹X.": which steps are done and whether the statement is cleared. */
export function resultLine(
  cardName: string,
  newlyPaid: number[],
  statementCleared: boolean,
): string {
  const nums = newlyPaid.map((n) => pad(n));
  let steps = '';
  if (nums.length === 1) steps = `Step ${nums[0]} is done. `;
  else if (nums.length > 1) {
    steps = `Steps ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]} are done. `;
  }
  const tail = statementCleared
    ? `${cardName}'s statement is cleared — no interest this cycle.`
    : `The plan is updated for ${cardName}.`;
  return `${steps}${tail}`;
}

/**
 * Records the payment (throws RepositoryError if the repository rejects it) and works out what
 * it settled. Pure apart from the one repository write.
 */
export function recordAndSummarise(args: {
  repository: DemoRepository;
  card: DemoCard;
  amount: number;
  today: IsoDate;
  cash: number;
  aimFor10: boolean;
  before: PlanView;
}): PaymentSummary {
  const { repository, card, amount, today, cash, aimFor10, before } = args;
  repository.recordPayment(card.id, amount, today);
  const after = buildPlanView({
    cards: repository.listCards(),
    payments: repository.listPayments(),
    rules: repository.getRules(),
    cash,
    today,
    aimFor10,
  });
  const alreadyPaid = new Set(before.steps.filter((s) => s.state === 'paid').map((s) => s.step));
  const newlyPaid = after.steps
    .filter((s) => s.cardId === card.id && s.state === 'paid' && !alreadyPaid.has(s.step))
    .map((s) => s.step);
  const updated = repository.listCards().find((c) => c.id === card.id);
  const owedBefore = Math.max(0, card.lastStatementBalance - card.paidSinceStatement);
  const owedAfter = updated
    ? Math.max(0, updated.lastStatementBalance - updated.paidSinceStatement)
    : owedBefore;
  return { amount, line: resultLine(card.name, newlyPaid, owedBefore > 0 && owedAfter === 0) };
}
