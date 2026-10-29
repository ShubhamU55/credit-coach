import { View } from 'react-native';

export type DashedRuleProps = {
  /** A colour from the theme (a hex literal is not allowed outside `theme/`). */
  color: string;
  testID?: string;
};

/**
 * A 1px dashed horizontal rule. Android draws dashes reliably only on a uniform border, so a
 * taller dashed box is clipped to its top edge by an `overflow: hidden` wrapper.
 * Decorative: hidden from screen readers.
 */
export function DashedRule({ color, testID = 'dashed-rule' }: DashedRuleProps) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 1, overflow: 'hidden' }}
    >
      <View
        testID={`${testID}-line`}
        style={{ height: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: color }}
      />
    </View>
  );
}
