import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color } from '../theme';
import { UtilizationLabel, isOverThreshold } from './UtilizationLabel';

describe('UtilizationLabel: boundaries and bad input', () => {
  test.each([
    [30, '✓ ON TARGET'],
    [30.01, '⚠ OVER 30%'],
    [10, '✓ ON TARGET'],
    [0, '✓ ON TARGET'],
    [-5, '✓ ON TARGET'],
  ])('%s against a threshold of 30 shows %s', async (percent, text) => {
    await render(<UtilizationLabel percent={percent} threshold={30} />);

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'a non-finite percent (%s) never gives a verdict: neutral n/a with its own accessible label',
    async (percent) => {
      await render(<UtilizationLabel percent={percent} threshold={30} />);

      expect(screen.queryByText(/ON TARGET/)).toBeNull();
      expect(screen.queryByText(/OVER/)).toBeNull();
      const label = screen.getByText('— N/A');
      expect(label).toHaveProp('accessibilityLabel', 'Utilization not available');
      expect(StyleSheet.flatten(label.props.style).color).toBe(color.muted);
    },
  );

  test('isOverThreshold is false for non-finite input', () => {
    expect(isOverThreshold(Number.NaN, 30)).toBe(false);
    expect(isOverThreshold(Number.POSITIVE_INFINITY, 30)).toBe(false);
  });
});
