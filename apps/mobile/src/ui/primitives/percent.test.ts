import { clampPercent, percentStyle } from './percent';

describe('percent helpers', () => {
  test.each([
    [45, 45],
    [-5, 0],
    [140, 100],
    [0.8000000000000007, 0.8],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('clampPercent(%s) is %s', (input, expected) => {
    expect(clampPercent(input)).toBe(expected);
  });

  test('percentStyle returns a percentage string', () => {
    expect(percentStyle(18.7)).toBe('18.7%');
    expect(percentStyle(250)).toBe('100%');
  });
});
