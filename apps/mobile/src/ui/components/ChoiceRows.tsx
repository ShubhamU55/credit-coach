import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, fontFamily, space } from '../theme';

export type ChoiceOption<K extends string> = {
  key: K;
  label: string;
  sub: string;
  /** Already formatted (e.g. "₹15,600"), or empty. */
  amount: string;
};

export type ChoiceRowsProps<K extends string> = {
  options: ChoiceOption<K>[];
  value: K;
  onChange: (key: K) => void;
  testID?: string;
};

const TICK_BOX = 18;

/** Choice rows (design.md 6.11): a radio group of square-ticked rows. Never default radio dots. */
export function ChoiceRows<K extends string>({
  options,
  value,
  onChange,
  testID = 'choice-rows',
}: ChoiceRowsProps<K>) {
  return (
    <View accessibilityRole="radiogroup" testID={testID} style={{ gap: space.grid }}>
      {options.map((option) => {
        const selected = option.key === value;
        const textColor = selected ? 'onAccent' : 'ink';
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={[option.label, option.sub, option.amount]
              .filter(Boolean)
              .join(', ')}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.key)}
            testID={`${testID}-${option.key}`}
            style={{
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.grid,
              paddingVertical: space.grid,
              paddingHorizontal: space.cardPad,
              borderWidth: 1,
              borderColor: selected ? color.accent : color.line,
              backgroundColor: selected ? color.accent : 'transparent',
            }}
          >
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              testID={`${testID}-${option.key}-tick`}
              style={{
                width: TICK_BOX,
                height: TICK_BOX,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: selected ? color.onAccent : color.line,
              }}
            >
              {selected ? (
                <Text variant="micro" color="onAccent" style={{ lineHeight: 12 }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                variant="body"
                color={textColor}
                style={{ fontFamily: fontFamily.sans800, fontSize: 14 }}
              >
                {option.label}
              </Text>
              <Text variant="caption" color={selected ? 'onAccentMuted' : 'muted'}>
                {option.sub}
              </Text>
            </View>
            {option.amount ? (
              <Text variant="numXS" color={textColor}>
                {option.amount}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
