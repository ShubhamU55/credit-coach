// The deterministic "Why this plan?" text, rebuilt from the payload alone. It is the fallback for
// every failure path and the reference the model is asked to reword.
//
// This is a copy of buildTemplateExplanation / formatINR / formatPercent / formatShortDate from
// packages/engine (explain.ts, format.ts), kept here because an Edge Function bundles only its own
// folder and Deno needs `.ts` import suffixes the engine does not use. A vitest case pins this copy
// to the engine output for several plans (tests/functions/explain/template.test.ts); if the engine
// wording changes, that test fails until this file is updated to match.

import type { ExplainPayload, PayloadItem } from './payload.ts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Indian digit grouping: last three digits together, then pairs (1,20,000). */
function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const tail = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return [...groups, tail].join(',');
}

export function formatINR(rupees: number): string {
  return `₹${groupIndianDigits(String(Math.round(Math.abs(rupees))))}`;
}

export function formatPercent(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  const sign = value < 0 && Number(fixed) !== 0 ? '−' : '';
  return `${sign}${fixed}%`;
}

/** `YYYY-MM-DD` as `Thu, 22 Oct`. The input is validated before it gets here. */
export function formatShortDate(isoDate: string): string {
  const date = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  );
  return `${DAY_NAMES[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function movement(label: string, before: number | null, after: number | null): string | null {
  if (before === null || after === null) return null;
  return `${label} goes from ${formatPercent(before)} to ${formatPercent(after)}.`;
}

const pay = (item: PayloadItem): string =>
  `${formatINR(item.amount)} on ${item.card} by ${formatShortDate(item.payBy)}`;

export function templateFromPayload(payload: ExplainPayload): string {
  const sentences: string[] = [];

  const minimums = payload.items.filter(
    (i) => i.kind === 'overdue_minimum' || i.kind === 'minimum',
  );
  if (minimums.length > 0) {
    const lead = minimums.some((i) => i.kind === 'overdue_minimum')
      ? 'Overdue minimums come first'
      : 'Minimums come first';
    sentences.push(
      `${lead}: ${joinList(minimums.map((i) => pay(i)))}. A missed payment hurts your score the most.`,
    );
  }

  const statements = payload.items.filter((i) => i.kind === 'statement');
  if (statements.length > 0) {
    const allFull = statements.every((i) => i.reasonCode === 'statement_full');
    const list = joinList(statements.map((i) => pay(i)));
    sentences.push(
      allFull
        ? `Then the full statement: ${list}. Paying it in full means no interest.`
        : `Then toward the statement: ${list}.`,
    );
  }

  const prepays = payload.items.filter((i) => i.kind === 'prepay');
  if (prepays.length > 0) {
    sentences.push(
      `Last, ${joinList(prepays.map((i) => pay(i)))} so a lower balance gets reported to the bureau.`,
    );
  }

  for (const s of payload.shortfalls) {
    const next =
      s.kind === 'overdue_minimum'
        ? 'Pay the rest now.'
        : `Pay the rest by ${formatShortDate(s.dueDate)}.`;
    sentences.push(
      `You are ${formatINR(s.shortfall)} short of the ${formatINR(s.required)} minimum on ${s.card}. ${next}`,
    );
  }

  const overall = movement(
    'Overall utilization',
    payload.overallUtilizationBefore,
    payload.overallUtilizationAfter,
  );
  const highest = movement(
    'Your highest card',
    payload.highestCardBefore,
    payload.highestCardAfter,
  );
  if (overall || highest) {
    sentences.push([overall, highest].filter((s): s is string => s !== null).join(' '));
  }

  if (payload.leftover > 0) {
    sentences.push(
      `${formatINR(payload.leftover)} is left over, so nothing more is needed this cycle.`,
    );
  }

  return sentences.join(' ');
}
