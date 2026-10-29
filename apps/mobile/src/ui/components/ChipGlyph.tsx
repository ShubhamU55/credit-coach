import { View } from 'react-native';
import { cardFinish, type CardFinish } from '../theme';

export type ChipGlyphProps = {
  finish: CardFinish;
};

/** The small card-chip drawing on card surfaces (design.md 6.4, 6.5). Decorative only. */
export function ChipGlyph({ finish }: ChipGlyphProps) {
  const tone = cardFinish[finish].muted;
  return (
    <View
      testID="chip-glyph"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 28,
        height: 20,
        borderWidth: 1,
        borderColor: tone,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 14, height: 1, backgroundColor: tone }} />
    </View>
  );
}
