import { Text } from '../primitives/Text';

export type ScoreRangeTextProps = {
  /** Already formatted by `formatScoreRange`, for example `708–736`. */
  range: string;
  size: 'XL' | 'M';
  testID?: string;
};

// Font-scale caps. A range must never wrap or truncate (design.md 3), and it cannot shrink to fit,
// so the biggest size stops growing early. The XL range is already large text at 1x.
// To be confirmed on a device at the largest font size (see the PD-7 ledger).
const MAX_FONT_SCALE = { XL: 1.1, M: 1.3 } as const;

/**
 * A score range on one line (design.md 3 and Review Focus 1). `numberOfLines={1}`, never
 * `adjustsFontSizeToFit`, and `flexShrink: 0` so a neighbour (the estimate tag, a chip) wraps to
 * the next line instead of squeezing the range.
 */
export function ScoreRangeText({ range, size, testID = 'score-range' }: ScoreRangeTextProps) {
  return (
    <Text
      variant={size === 'XL' ? 'numXL' : 'numM'}
      numberOfLines={1}
      adjustsFontSizeToFit={false}
      maxFontSizeMultiplier={MAX_FONT_SCALE[size]}
      testID={testID}
      style={{ flexShrink: 0 }}
    >
      {range}
    </Text>
  );
}
