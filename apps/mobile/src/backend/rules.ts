import { DEFAULT_GUARD_CONFIG, PLANNER_STEPS } from '@credit-coach/engine';

import type { DemoRules, ReportingBasis } from '../demo/types';

/**
 * The single `coach_rules` row, validated. The ranges mirror the CHECK constraints in
 * supabase/migrations/20261028100000_core_tables.sql, so a row that the database would refuse is
 * refused here too, and one bad field rejects the whole row (the seed rules stay in force).
 *
 * Columns the app does not read yet are not parsed: predictor_weights, reminder_prepay_days,
 * reminder_due_days, updated_at, updated_by. pay_by_buffer_days and planner_step_order are
 * validated but not applied: the Home and Plan adapters build the engine rules from the engine
 * defaults, which equal the database defaults (buffer 1, default order). Applying them needs a
 * screen change and is a follow-up.
 */
export interface CoachRulesRow {
  thresholdPct: number;
  excellentPct: number;
  reportingBasis: ReportingBasis;
  payByBufferDays: number;
  plannerStepOrder: readonly string[];
  minHardInquiries6m: number;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function isStepPermutation(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length !== PLANNER_STEPS.length) return false;
  const steps: readonly unknown[] = PLANNER_STEPS;
  return new Set(value).size === value.length && value.every((step) => steps.includes(step));
}

function parseBasis(value: unknown): ReportingBasis | null {
  return value === 'statement' || value === 'weekly_current' ? value : null;
}

/** Returns the validated row, or null for anything the database itself would not hold. */
export function parseCoachRulesRow(raw: unknown): CoachRulesRow | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const thresholdPct = intInRange(row.threshold_pct, 5, 50);
  const excellentPct = intInRange(row.excellent_pct, 1, 30);
  const payByBufferDays = intInRange(row.pay_by_buffer_days, 0, 7);
  const minHardInquiries6m = intInRange(row.guard_min_hard_inquiries, 1, 10);
  const basis = parseBasis(row.reporting_basis);
  const order = row.planner_step_order;
  if (
    [thresholdPct, excellentPct, payByBufferDays, minHardInquiries6m, basis].includes(null) ||
    !isStepPermutation(order)
  ) {
    return null;
  }
  return {
    thresholdPct: thresholdPct as number,
    excellentPct: excellentPct as number,
    reportingBasis: basis as ReportingBasis,
    payByBufferDays: payByBufferDays as number,
    plannerStepOrder: order,
    minHardInquiries6m: minHardInquiries6m as number,
  };
}

/**
 * The rules the screens read. `aimFor10` is the user's own switch, so it is kept from `current`.
 * The guard line is set only when it differs from the engine default: the seed leaves it unset
 * (meaning the default), so the default database row maps to exactly the seed rules.
 */
export function toDemoRules(row: CoachRulesRow, current: DemoRules): DemoRules {
  const rules: DemoRules = {
    ...current,
    thresholdPct: row.thresholdPct,
    excellentPct: row.excellentPct,
    reportingBasis: row.reportingBasis,
  };
  delete rules.minHardInquiries6m;
  if (row.minHardInquiries6m !== DEFAULT_GUARD_CONFIG.minHardInquiries6m) {
    rules.minHardInquiries6m = row.minHardInquiries6m;
  }
  return rules;
}
