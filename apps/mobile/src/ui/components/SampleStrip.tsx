import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { color } from '../theme';
import { TextAction } from './Buttons';

export type SampleStripProps = {
  onSwitch: () => void;
};

/**
 * "Sample profile · Switch" strip (design.md 6.18, rule 7): stays visible on every screen while
 * the sample is active. The `info` dot is decorative; the words say it.
 */
export function SampleStrip({ onSwitch }: SampleStripProps) {
  return (
    <View
      testID="sample-strip"
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}
    >
      <View
        testID="sample-strip-dot"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.info }}
      />
      <Text variant="micro" color="muted">
        SAMPLE PROFILE ·
      </Text>
      <TextAction label="Switch" onPress={onSwitch} testID="sample-strip-switch" />
    </View>
  );
}
