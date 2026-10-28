import { View } from 'react-native';
import { Text, type TextColor } from '../primitives/Text';
import { color, space } from '../theme';
import { ScoreRangeText } from './ScoreRangeText';

/** Fixed copy: closing a card must warn about credit age AND limit loss, next to the result. */
export const CLOSE_CARD_AGE_WARNING =
  'Closing a card shortens your average credit age, which can lower your score over time.';
export const CLOSE_CARD_LIMIT_WARNING =
  'You also lose that card’s limit, so your overall utilization goes up.';

export type WhatIfDirection = 'lowers' | 'improves' | 'barely moves';

export type WhatIfResultProps = {
  /** Already formatted by `formatScoreRange`, for example `690–718`. */
  range: string;
  direction: WhatIfDirection;
  /**
   * `closeCard` always shows both warnings (CLAUDE.md non-negotiable 4, design.md 1.4). The
   * warning text is fixed and cannot be passed in, so it cannot be blanked or reworded.
   */
  variant: 'standard' | 'closeCard';
};

const DIRECTION: Record<WhatIfDirection, { arrow: string; tone: TextColor }> = {
  lowers: { arrow: '↓', tone: 'error' },
  improves: { arrow: '↑', tone: 'success' },
  'barely moves': { arrow: '→', tone: 'muted' },
};

/**
 * What-if result (design.md 6.15, 1.4): the estimated range, the direction in words, and an
 * always-mounted warning slot that holds the credit-age and limit-loss warning for "Close a card".
 * The slot is a polite live region, so a warning that appears is announced.
 */
export function WhatIfResult({ range, direction, variant }: WhatIfResultProps) {
  const { arrow, tone } = DIRECTION[direction];
  return (
    <View
      testID="what-if-result"
      style={{
        padding: space.heroPad,
        gap: 12,
        borderWidth: 1,
        borderColor: color.hairline,
        backgroundColor: color.surface,
      }}
    >
      <Text variant="overline">ESTIMATED SCORE AFTER</Text>
      <ScoreRangeText range={range} size="XL" />
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}
      >
        <Text variant="estimateTag">estimate</Text>
        <Text variant="caption">Not your official CIBIL score.</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          variant="title"
          color={tone}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {arrow}
        </Text>
        <Text variant="body" color="ink">{`${direction} your score`}</Text>
      </View>
      <View
        testID="what-if-warning"
        accessibilityLiveRegion="polite"
        style={{ gap: 6, ...(variant === 'closeCard' ? warningBox : null) }}
      >
        {variant === 'closeCard' ? (
          <>
            <Text variant="bodyS" color="warning">
              {CLOSE_CARD_AGE_WARNING}
            </Text>
            <Text variant="bodyS" color="warning">
              {CLOSE_CARD_LIMIT_WARNING}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const warningBox = {
  padding: space.cardPad,
  borderWidth: 1,
  borderColor: color.warning,
  backgroundColor: color.warningTint,
} as const;
