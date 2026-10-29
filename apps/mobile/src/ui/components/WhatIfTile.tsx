import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PopPressable } from '../primitives/PopPressable';
import { Text } from '../primitives/Text';
import { color, space } from '../theme';

export type WhatIfTileProps = {
  /** Decorative. Pass a `link` coloured glyph for the suggested tile. */
  icon: ReactNode;
  label: string;
  /** The tile this month's plan suggests: accent border and the small accent pop shadow. */
  suggested?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * What-if tile (design.md 6.15). Suggested = `popSmall` + accent border; others = `tileIdle` +
 * `lineStrong` border. Both use the 3px pop press. The caller sets the grid width.
 */
export function WhatIfTile({
  icon,
  label,
  suggested = false,
  onPress,
  testID = 'what-if-tile',
}: WhatIfTileProps) {
  return (
    <PopPressable
      shadowKind={suggested ? 'popSmall' : 'tileIdle'}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={suggested ? 'Suggested' : undefined}
      testID={testID}
      style={{
        alignSelf: 'stretch',
        // minHeight, not height: the label must not clip at 200% font scale.
        minHeight: 92,
        justifyContent: 'space-between',
        gap: space.grid,
        padding: space.grid,
        borderWidth: 1,
        borderColor: suggested ? color.accent : color.lineStrong,
        backgroundColor: color.surface,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {icon}
      </View>
      <Text variant="title" style={{ fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
    </PopPressable>
  );
}
