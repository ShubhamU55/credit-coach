import {
  formatBeforeAfter,
  formatINR,
  formatPercent,
  formatScoreRange,
  formatShortDate,
} from '@credit-coach/engine';
import { finishForIndex, type CardFinish } from '../theme';
import type { DateBlockItem } from '../components/DateBlockTimeline';
import type { TimelineLane } from '../components/PaymentTimelineStrip';
import type { ScoreZoneSpec } from '../components/ScoreCard';

// The Aarav demo fixture (docs/design.md section 8). Every figure goes through the engine
// formatters, so the gallery shows the same strings the screens will.

export const TODAY_ISO = '2026-10-21';
export const THRESHOLD = 30;

type CardFixture = {
  name: string;
  finish: CardFinish;
  utilPercent: number;
  line: string;
};

export const CARDS: CardFixture[] = [
  {
    name: 'HDFC Millennia',
    utilPercent: 81,
    line: `${formatINR(81000)} / ${formatINR(100000)} · due ${formatShortDate('2026-11-04')}`,
  },
  {
    name: 'SBI SimplyClick',
    utilPercent: 32,
    line: `${formatINR(38400)} / ${formatINR(120000)} · paid in full`,
  },
  {
    name: 'Axis Neo',
    utilPercent: 19.5,
    line: `${formatINR(15600)} / ${formatINR(80000)} · due ${formatShortDate('2026-10-22')}`,
  },
].map((card, i) => ({ ...card, finish: finishForIndex(i) }));

export const HERO = {
  finish: finishForIndex(2), // Axis Neo is the third card: plum
  cardName: 'Axis Neo',
  dueChip: `BY ${formatShortDate('2026-10-22').toUpperCase()}`,
  amount: formatINR(12400),
  minimumLine: `${formatINR(620)} of it is your minimum.`,
  stepsDone: 2,
  stepsTotal: 5,
};

export const OVERALL_UTIL = formatPercent(45);
export const AFTER_PLAN_UTIL = formatPercent(15.3);
export const SCORE_RANGE = formatScoreRange(708, 736);
export const PLAN_SCORE_RANGE = formatScoreRange(724, 752);

// Placeholder cut points: the real ones come from engine config (design.md 6.13).
export const ZONES: ScoreZoneSpec[] = [
  { name: 'Poor', from: 300, to: 550 },
  { name: 'Fair', from: 550, to: 650 },
  { name: 'Good', from: 650, to: 750 },
  { name: 'Excellent', from: 750, to: 900 },
];

export const STEPS = [
  {
    kind: 'PAY THE MINIMUM',
    cardName: 'Axis Neo',
    amount: formatINR(620),
    payBy: { label: 'BY TOMORROW', soon: true },
    reason: 'Pay before the statement is reported so it counts as on time.',
    before: 19.5,
    after: 18.7,
  },
  {
    kind: 'PAY THE MINIMUM',
    cardName: 'HDFC Millennia',
    amount: formatINR(3710),
    payBy: { label: `BY ${formatShortDate('2026-11-04').toUpperCase()}`, soon: false },
    reason: 'Covers the minimum so there is no missed-payment mark.',
    before: 81,
    after: 77.3,
  },
  {
    kind: 'CLEAR THE STATEMENT',
    cardName: 'Axis Neo',
    amount: formatINR(11780),
    payBy: { label: 'BY TOMORROW', soon: true },
    reason: 'Clears the full statement, so zero interest.',
    before: 18.7,
    after: 4,
  },
].map((step) => ({
  ...step,
  barLabel: formatBeforeAfter(formatPercent(step.before), formatPercent(step.after)),
}));

export const COMING_UP: DateBlockItem[] = [
  {
    day: 'Sat',
    date: '24',
    month: 'Oct',
    title: 'SBI SimplyClick',
    reason: `Pay before it's reported · ${formatBeforeAfter('32.0%', '30.0%')}`,
    amount: formatINR(2400),
  },
  {
    day: 'Wed',
    date: '4',
    month: 'Nov',
    title: 'HDFC Millennia',
    reason: `Statement due · ${formatBeforeAfter('77.3%', '6.8%')}`,
    amount: formatINR(70490),
  },
];

// SBI's last statement was paid in full, so it has no due date this cycle: no Due marker.
export const LANES: TimelineLane[] = [
  {
    cardName: 'Axis Neo',
    payBy: { iso: '2026-10-22', label: `${formatINR(12400)} · 22 Oct` },
    due: '2026-10-22',
    statement: '2026-11-02',
  },
  {
    cardName: 'SBI SimplyClick',
    payBy: { iso: '2026-10-24', label: `${formatINR(2400)} · 24 Oct` },
    statement: '2026-10-25',
  },
  {
    cardName: 'HDFC Millennia',
    payBy: { iso: '2026-11-04', label: `${formatINR(74200)} · 4 Nov` },
    due: '2026-11-04',
    statement: '2026-11-15',
  },
];

export const TIMELINE_LABEL =
  `Axis Neo: pay ${formatINR(12400)} by Thu, 22 Oct, which is also the due date; statement reported 2 Nov. ` +
  `SBI SimplyClick: pay ${formatINR(2400)} by Sat, 24 Oct; no due date this cycle; statement reported 25 Oct. ` +
  `HDFC Millennia: pay ${formatINR(74200)} by Wed, 4 Nov, which is also the due date; statement reported 15 Nov.`;

export const WHAT_IFS = [
  { label: "Follow this month's plan", glyph: '✓', suggested: true },
  { label: 'Pay an amount on a card', glyph: '₹', suggested: false },
  { label: 'Miss a payment', glyph: '!', suggested: false },
  { label: 'Close a card', glyph: '×', suggested: false },
  { label: 'Apply for a card or loan', glyph: '+', suggested: false },
  { label: 'Open an FD-backed card', glyph: '◆', suggested: false },
];

export const AI_TEXT =
  'Axis Neo gets paid first because its statement is reported tomorrow. Then HDFC Millennia, ' +
  'which carries most of your balance. That is what brings your overall use down.';
