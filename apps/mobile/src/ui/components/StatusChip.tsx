import { View } from 'react-native';
import { Text, type TextColor } from '../primitives/Text';
import { color } from '../theme';
import { overlay } from '../theme/kitB';

export type StatusChipVariant = 'dueSoon' | 'neutral' | 'onFinish';

export type StatusChipProps = {
  label: string;
  variant: StatusChipVariant;
  /** A 6px status dot before the label. Decorative: the label carries the meaning. */
  dot?: boolean;
  testID?: string;
};

const VARIANT: Record<StatusChipVariant, { fill: string; text: TextColor }> = {
  dueSoon: { fill: color.warningTint, text: 'warning' },
  neutral: { fill: color.surface2, text: 'body' },
  // Sits on a card finish (hero payment card), so it is a translucent black with warning text.
  onFinish: { fill: overlay.onFinishChip, text: 'warning' },
};

/**
 * Status chip (design.md 6.20): square, 24 tall, micro text, optional 6px dot.
 * The caller puts the glyph or word in the label (for example "⚠ BY TOMORROW"), so colour is
 * never the only signal.
 */
export function StatusChip({ label, variant, dot, testID = 'status-chip' }: StatusChipProps) {
  const { fill, text } = VARIANT[variant];
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        // minHeight, not height: the label must not clip at 200% font scale.
        minHeight: 24,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: fill,
      }}
    >
      {dot ? (
        <View
          testID={`${testID}-dot`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color[text] }}
        />
      ) : null}
      <Text variant="micro" color={text}>
        {label}
      </Text>
    </View>
  );
}
