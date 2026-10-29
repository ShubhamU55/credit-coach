import { formatPercent } from '@credit-coach/engine';
import { View, type ViewStyle } from 'react-native';
import { PopPressable } from '../primitives/PopPressable';
import { percentStyle } from '../primitives/percent';
import { Text } from '../primitives/Text';
import { cardFinish, color, shadow, space, type CardFinish } from '../theme';
import { ChipGlyph } from './ChipGlyph';
import { UtilizationLabel, isOverThreshold } from './UtilizationLabel';

export type CardTileProps = {
  name: string;
  finish: CardFinish;
  /** Utilization of this card, in percent. */
  utilPercent: number;
  /** The configured threshold (default 30, editable in admin). */
  threshold: number;
  /** For example `₹81,000 / ₹1,00,000 · due 4 Nov`, already formatted. */
  line: string;
  onPress?: () => void;
  testID?: string;
};

const SHADOW_OFFSET = 4;

/**
 * Card tile for the carousel (design.md 6.5): 240 wide, finish fill and border, `cardTile`
 * shadow. Utilization is warning-coloured only above the threshold and always comes with the
 * `⚠ OVER` / `✓ ON TARGET` words. Never a bank colour, never a red bar.
 */
export function CardTile({
  name,
  finish,
  utilPercent,
  threshold,
  line,
  onPress,
  testID = 'card-tile',
}: CardTileProps) {
  const finishColors = cardFinish[finish];
  const over = isOverThreshold(utilPercent, threshold);
  const value = formatPercent(utilPercent);
  const toneColor = over ? color.warning : color.ink;
  const surface: ViewStyle = {
    width: 240,
    // minHeight, not height: nothing may clip at 200% font scale.
    minHeight: 150,
    padding: space.cardPad,
    gap: 6,
    borderWidth: 1,
    borderColor: finishColors.border,
    backgroundColor: finishColors.fill,
  };
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="title" style={{ flex: 1 }}>
          {name}
        </Text>
        <ChipGlyph finish={finish} />
      </View>
      <Text variant="numM" color={over ? 'warning' : 'ink'} numberOfLines={1}>
        {value}
      </Text>
      <UtilizationLabel percent={utilPercent} threshold={threshold} />
      <View
        testID={`${testID}-bar-track`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 4, backgroundColor: finishColors.track }}
      >
        <View
          testID={`${testID}-bar-fill`}
          style={{ height: 4, width: percentStyle(utilPercent), backgroundColor: toneColor }}
        />
      </View>
      <Text variant="caption" style={{ color: finishColors.muted }}>
        {line}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View
        testID={testID}
        style={{ ...surface, marginRight: SHADOW_OFFSET, boxShadow: shadow.cardTile }}
      >
        {body}
      </View>
    );
  }
  return (
    <PopPressable
      shadowKind="cardTile"
      onPress={onPress}
      testID={testID}
      accessibilityLabel={`${name}, ${value}, ${over ? `over ${threshold}%` : 'on target'}, ${line}`}
      style={surface}
    >
      {body}
    </PopPressable>
  );
}
