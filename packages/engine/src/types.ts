/**
 * Shared engine types for cards, coach rules, reporting points and the payment plan
 * (PRD §5.2-§5.4). Money is always integer rupees; dates are `YYYY-MM-DD` calendar dates.
 * Other streams (app shell, screens, reminders, explanations) build against these shapes.
 */

/** A calendar date as `YYYY-MM-DD` (no time, no time zone). */
export type IsoDate = string;

/** A whole number of rupees. Never a float. */
export type Rupees = number;

/**
 * Which balance is reported to the bureau, and when (PRD §5.4, F3 unconfirmed).
 * - `statement`: on the statement date, with the statement balance (default, the demo basis).
 * - `weekly_current`: on the next 7th, 14th, 21st, 28th or month-end, with the current outstanding.
 */
export type ReportingBasis = 'statement' | 'weekly_current';

/** The planner's priority steps (PRD §5.3 steps 1-4; step 5 is the leftover). */
export type PlannerStep = 'overdue' | 'minimum' | 'statement' | 'prepay';

/** The PRD §5.3 default priority order. */
export const PLANNER_STEPS: readonly PlannerStep[] = ['overdue', 'minimum', 'statement', 'prepay'];

/** One credit card as the engine sees it. */
export interface Card {
  id: string;
  /** Display name, e.g. `HDFC Millennia`. */
  name: string;
  /** Issuer, e.g. `HDFC Bank`. */
  issuer: string;
  /** Credit limit. A limit of 0 (or missing/invalid) excludes the card from utilization (PRD §5.2). */
  limit: Rupees;
  /** Current outstanding, already lowered by every recorded payment. */
  outstanding: Rupees;
  /** Balance on the last statement. 0 means nothing was billed (no due date this cycle). */
  lastStatementBalance: Rupees;
  /** Day of the month the statement is generated (1-31, clamped to the month's last day). */
  statementDay: number;
  /** Day of the month payment is due (1-31, clamped); the first such day after the statement. */
  dueDay: number;
  /** Minimum due on the last statement. */
  minimumDue: Rupees;
  /** Total paid since the last statement date (drives remaining statement and overdue). */
  paidSinceStatement: Rupees;
  /** Annual interest rate in percent, if known. Orders step 3 (highest first). */
  interestRatePct?: number;
}

/** A recorded payment ("Mark as paid", PRD §5.3 payment tracking). */
export interface Payment {
  cardId: string;
  amount: Rupees;
  date: IsoDate;
}

/** Admin-configurable coaching rules (PRD §5.3, §5.4, §6). */
export interface CoachRules {
  /** Utilization threshold in percent (default 30). Step 4 pays cards down to it. */
  thresholdPct: number;
  /** The "excellent" line in percent (default 10), used only when `aimFor10` is on. */
  excellentPct: number;
  reportingBasis: ReportingBasis;
  /** Pay-by = reporting point minus this many days (default 1: "one day before"). */
  payByBufferDays: number;
  /** The "Aim for 10% utilization" switch on the Plan screen. Off by default. */
  aimFor10: boolean;
  /** The order the planner runs its steps in; a permutation of `PLANNER_STEPS`. */
  plannerStepOrder: readonly PlannerStep[];
}

/** The PRD defaults (owner decision 21 Oct: the 10% switch is off by default). */
export const DEFAULT_COACH_RULES: CoachRules = {
  thresholdPct: 30,
  excellentPct: 10,
  reportingBasis: 'statement',
  payByBufferDays: 1,
  aimFor10: false,
  plannerStepOrder: PLANNER_STEPS,
};

/** Everything `planPayments` needs. The plan is recomputed from this every time (never frozen). */
export interface PlanInput {
  cards: readonly Card[];
  /** Cash available to pay cards in the next 30 days. */
  cash: Rupees;
  today: IsoDate;
  rules: CoachRules;
}

/** Where a card stands in its billing cycle on `today`. */
export interface CardCycle {
  cardId: string;
  lastStatementDate: IsoDate;
  nextStatementDate: IsoDate;
  /** The due date for the last statement, or null when nothing is owed on it. */
  dueDate: IsoDate | null;
  /** max(0, lastStatementBalance − paidSinceStatement). */
  remainingStatement: Rupees;
  /** max(0, minimumDue − paidSinceStatement). */
  remainingMinimum: Rupees;
  /** The due date has passed and paidSinceStatement < minimumDue. */
  isOverdue: boolean;
}

/** The next moment a card's balance is reported to the bureau (PRD §5.4). */
export interface ReportingPoint {
  cardId: string;
  basis: ReportingBasis;
  /** The reporting date itself. */
  date: IsoDate;
  /** Which balance is reported on that date. */
  balance: 'statement' | 'current';
  /** The last day to pay so the lower balance is reported: date − buffer, never before today. */
  payBy: IsoDate;
}

export type PlanItemKind = 'overdue_minimum' | 'minimum' | 'statement' | 'prepay';

/** Stable machine codes for plan reasons; screens and explanations may key copy off these. */
export type ReasonCode =
  | 'overdue'
  | 'minimum_due_soon'
  | 'minimum_due'
  | 'statement_full'
  | 'statement_partial'
  | 'statement_after_due'
  | 'prepay_threshold'
  | 'prepay_excellent'
  | 'prepay_partial'
  | 'nothing_more_needed'
  | 'all_within_threshold'
  | 'above_threshold'
  | 'shortfall';

/** A stable code plus a plain-English sentence the UI can show as-is. */
export interface Reason {
  code: ReasonCode;
  text: string;
}

/** One ordered payment instruction. */
export interface PlanItem {
  /** 1-based position in the plan (the "01".."05" on the Plan screen). */
  step: number;
  kind: PlanItemKind;
  cardId: string;
  /** Always a positive integer, and a card's items never sum past its outstanding. */
  amount: Rupees;
  payBy: IsoDate;
  reason: Reason;
  /** Card utilization % (1 dp) before and after this item; null for an excluded card. */
  utilizationBefore: number | null;
  utilizationAfter: number | null;
}

/** A minimum the cash cannot cover. Shown, never hidden (PRD §5.3 step 2). */
export interface Shortfall {
  cardId: string;
  kind: 'overdue_minimum' | 'minimum';
  /** The minimum still owed (capped at the outstanding). */
  required: Rupees;
  /** What this plan pays towards it. */
  funded: Rupees;
  /** required − funded, always > 0. */
  shortfall: Rupees;
  dueDate: IsoDate;
}

export interface Plan {
  items: PlanItem[];
  shortfalls: Shortfall[];
  /** Cash not allocated ("Nothing more needed this cycle."). cash = Σ amounts + leftover. */
  leftover: Rupees;
  /** Shown with the leftover when it is > 0, otherwise null. */
  leftoverReason: Reason | null;
  /** Overall utilization % (1 dp) before and after the plan; null when no card has a valid limit. */
  overallUtilizationBefore: number | null;
  overallUtilizationAfter: number | null;
  /** The highest single-card utilization % (1 dp) before and after; null when none is valid. */
  highestCardBefore: number | null;
  highestCardAfter: number | null;
  /** True when every card with a valid limit ends at or under the threshold and nothing is short. */
  withinThreshold: boolean;
  /** One-line outcome: all within threshold, some above it, or a shortfall. */
  summary: Reason;
  /** Cards with a zero, negative or invalid limit: excluded from utilization and flagged (§5.2). */
  excludedCardIds: string[];
}
