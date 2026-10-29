import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { color } from '../theme';

export type ReasonDirection = 'lowers' | 'improves';

export type ReasonRowProps = {
  title: string;
  direction: ReasonDirection;
  /** Detail after the direction words, for example "biggest drag". Optional. */
  caption?: string;
};

const DIRECTION = {
  lowers: { arrow: '↓', tint: color.errorTint, tone: 'error' },
  improves: { arrow: '↑', tint: color.successTint, tone: 'success' },
} as const;

/**
 * Reason row (design.md 6.14). The row writes the direction in words itself ("lowers your score"),
 * so a caller cannot ship a colour-only row. The arrow tile is decorative.
 */
export function ReasonRow({ title, direction, caption }: ReasonRowProps) {
  const { arrow, tint, tone } = DIRECTION[direction];
  const words = `${direction} your score`;
  const line = caption ? `${words} · ${caption}` : words;
  return (
    <View
      testID="reason-row"
      accessible
      accessibilityLabel={`${title}, ${line.replace(' · ', ', ')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: color.hairline,
        backgroundColor: color.surface,
      }}
    >
      <View
        testID="reason-row-tile"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint,
        }}
      >
        <Text variant="title" color={tone}>
          {arrow}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        <Text variant="caption" color="muted">
          {line}
        </Text>
      </View>
    </View>
  );
}
