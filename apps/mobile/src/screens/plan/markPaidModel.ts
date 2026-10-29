import { formatINR, formatShortDate } from '@credit-coach/engine';

import type { DemoCard } from '../../demo/types';
import type { PlanView, StepView } from './planModel';

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
}

export type Resolved =
  | { kind: 'invalid'; message: string }
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

function shortDay(iso: string): string {
  return formatShortDate(iso).split(', ')[1] ?? iso;
}

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
  if (!card || card.outstanding <= 0) {
    return {
      kind: 'invalid',
      message: card
        ? `Nothing is outstanding on ${card.name}.`
        : "We couldn't find that card, or there is nothing left to mark as paid.",
    };
  }
  const open = view.steps.filter((s) => s.cardId === card.id && s.state !== 'paid');
  const options = buildOptions(card, open);
  const lane = view.lanes.find((l) => l.cardName === card.name);
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
    dueLabel: lane?.due ? shortDay(lane.due) : '',
  };
}

export interface OtherValidation {
  status: 'default' | 'error' | 'warning';
  message?: string;
  canConfirm: boolean;
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
      canConfirm: false,
      confirmLabel: 'Confirm payment',
    };
  }
  if (amount > ctx.outstanding) {
    return {
      status: 'error',
      message: `That's more than the ${formatINR(ctx.outstanding)} outstanding.`,
      canConfirm: false,
      confirmLabel: 'Confirm payment',
    };
  }
  if (amount < ctx.minimum) {
    const by = ctx.dueLabel ? ` — pay the rest by ${ctx.dueLabel}` : '';
    return {
      status: 'warning',
      message: `⚠ ${formatINR(ctx.minimum - amount)} short of the ${formatINR(ctx.minimum)} minimum. This counts as a missed payment${by}.`,
      canConfirm: true,
      confirmLabel: 'Record anyway',
    };
  }
  return { status: 'default', canConfirm: true, confirmLabel: 'Confirm payment' };
}
