/** Clamp to 0..100 and round to 2 decimals, for percentage `width`/`left` style values. */
export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

/** A style-ready percentage string such as `45%`, clamped to 0..100. */
export function percentStyle(n: number): `${number}%` {
  return `${clampPercent(n)}%`;
}
