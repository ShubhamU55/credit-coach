import { Text } from '../primitives/Text';

/**
 * At the threshold counts as on target; only strictly above it is "over" (design.md 2.2).
 * A value that is not a finite number is never over (and UtilizationLabel never calls it on target).
 */
export function isOverThreshold(percent: number, threshold: number): boolean {
  return Number.isFinite(percent) && percent > threshold;
}

export type UtilizationLabelProps = {
  percent: number;
  /** The configured threshold (default 30, editable in admin). Never hard-coded here. */
  threshold: number;
};

/**
 * `⚠ OVER 30%` in warning, or `✓ ON TARGET` in ink. Never red (design.md 2.2).
 * If the percent is not a finite number (NaN, a divide by zero) there is no verdict to give, so it
 * shows a neutral `— N/A` instead of a false "on target".
 */
export function UtilizationLabel({ percent, threshold }: UtilizationLabelProps) {
  if (!Number.isFinite(percent)) {
    return (
      <Text
        variant="micro"
        color="muted"
        numberOfLines={1}
        accessibilityLabel="Utilization not available"
      >
        — N/A
      </Text>
    );
  }
  const over = isOverThreshold(percent, threshold);
  return (
    <Text
      variant="micro"
      color={over ? 'warning' : 'ink'}
      numberOfLines={1}
      // The glyph is read aloud as a symbol name; the words carry the meaning.
      accessibilityLabel={over ? `Over ${threshold}%` : 'On target'}
    >
      {over ? `⚠ OVER ${threshold}%` : '✓ ON TARGET'}
    </Text>
  );
}
