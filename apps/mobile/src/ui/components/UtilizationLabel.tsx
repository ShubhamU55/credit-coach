import { Text } from '../primitives/Text';

/** At the threshold counts as on target; only strictly above it is "over" (design.md 2.2). */
export function isOverThreshold(percent: number, threshold: number): boolean {
  return percent > threshold;
}

export type UtilizationLabelProps = {
  percent: number;
  /** The configured threshold (default 30, editable in admin). Never hard-coded here. */
  threshold: number;
};

/** `⚠ OVER 30%` in warning, or `✓ ON TARGET` in ink. Never red (design.md 2.2). */
export function UtilizationLabel({ percent, threshold }: UtilizationLabelProps) {
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
