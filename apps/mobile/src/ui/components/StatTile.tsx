import { Pressable, View } from 'react-native';
import { percentStyle } from '../primitives/percent';
import { Text } from '../primitives/Text';
import { color, space } from '../theme';

export type StatTileProps = {
  overline: string;
  /** Already formatted by the engine formatters, for example `45.0%` or `708–736`. */
  value: string;
  /** Over the threshold: the value and bar turn warning. Pair it with a UtilizationLabel or words. */
  over?: boolean;
  barPercent: number;
  targetPercent: number;
  caption: string;
  /** Own line, in success, for example `↓ 15.3% after plan`. */
  delta?: string;
  onPress?: () => void;
  testID?: string;
};

const tileStyle = {
  padding: space.cardPad,
  borderWidth: 1,
  borderColor: color.hairline,
  backgroundColor: color.surface,
} as const;

/**
 * Stat tile (design.md 6.6): hairline border, no shadow, number, 6px bar with a 2px target tick,
 * caption and the delta on its own line. A ring or gauge is never used.
 */
export function StatTile({
  overline,
  value,
  over = false,
  barPercent,
  targetPercent,
  caption,
  delta,
  onPress,
  testID = 'stat-tile',
}: StatTileProps) {
  const body = (
    <View style={{ gap: 6 }}>
      <Text variant="overline">{overline}</Text>
      <Text variant="numM" color={over ? 'warning' : 'ink'} numberOfLines={1}>
        {value}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 6, backgroundColor: color.hairline }}
      >
        <View
          testID={`${testID}-bar-fill`}
          style={{
            height: 6,
            width: percentStyle(barPercent),
            backgroundColor: over ? color.warning : color.ink,
          }}
        />
        <View
          testID={`${testID}-bar-target`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 2,
            left: percentStyle(targetPercent),
            backgroundColor: color.ink,
          }}
        />
      </View>
      <Text variant="caption">{caption}</Text>
      {delta ? (
        <Text variant="caption" color="success">
          {delta}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={tileStyle}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[overline, value, caption, delta].filter(Boolean).join(', ')}
      onPress={onPress}
      style={{ ...tileStyle, minHeight: space.touch }}
    >
      {body}
    </Pressable>
  );
}
