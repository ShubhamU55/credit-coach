import { describe, it, expect } from 'vitest';
import { utilization, overallUtilization } from './utilization';

describe('utilization', () => {
  it('computes percent to 1 dp', () => {
    expect(utilization(4500, 15000)).toBe(30.0);
    expect(utilization(1, 3)).toBe(33.3);
    expect(utilization(0, 50000)).toBe(0);
  });
  it('returns null for zero, negative or non-finite limit', () => {
    expect(utilization(100, 0)).toBeNull();
    expect(utilization(100, -5)).toBeNull();
    expect(utilization(100, Number.NaN)).toBeNull();
  });
});

describe('overallUtilization', () => {
  it('sums across valid cards and excludes invalid limits', () => {
    expect(
      overallUtilization([
        { outstanding: 12000, limit: 15000 },
        { outstanding: 3000, limit: 45000 },
        { outstanding: 999, limit: 0 },
      ]),
    ).toBe(25.0);
  });
  it('returns null when no card has a valid limit', () => {
    expect(overallUtilization([{ outstanding: 10, limit: 0 }])).toBeNull();
    expect(overallUtilization([])).toBeNull();
  });
});
