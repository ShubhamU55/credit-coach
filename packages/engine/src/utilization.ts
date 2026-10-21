/** Card balance and limit in rupees. The ratio is unit-agnostic; inputs are integer rupees. */
export interface BalanceAndLimit {
  outstanding: number;
  limit: number;
}

const roundTo1dp = (n: number): number => Math.round(n * 10) / 10;

const hasValidLimit = (limit: number): boolean => Number.isFinite(limit) && limit > 0;

/**
 * Utilization as a percentage rounded to 1 dp.
 * Returns null when the limit is zero, negative or not finite (PRD §5.2: excluded and flagged).
 */
export function utilization(outstanding: number, limit: number): number | null {
  if (!hasValidLimit(limit)) return null;
  return roundTo1dp((outstanding / limit) * 100);
}

/** Σ outstanding ÷ Σ limit over cards with a valid limit, rounded to 1 dp. Null if none are valid. */
export function overallUtilization(cards: ReadonlyArray<BalanceAndLimit>): number | null {
  const valid = cards.filter((c) => hasValidLimit(c.limit));
  if (valid.length === 0) return null;
  const outstanding = valid.reduce((sum, c) => sum + c.outstanding, 0);
  const limit = valid.reduce((sum, c) => sum + c.limit, 0);
  return utilization(outstanding, limit);
}
