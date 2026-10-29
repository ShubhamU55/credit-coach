import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { usePressed } from '../primitives/usePressed';
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
  /** Disables every row: no presses, `accessibilityState.disabled`, dimmed with a dashed border. */
  disabled?: boolean;
  testID?: string;
};

const TICK_BOX = 18;

type RowProps<K extends string> = {
  option: ChoiceOption<K>;
  selected: boolean;
  disabled: boolean;
  onChange: (key: K) => void;
  testID: string;
};

function ChoiceRow<K extends string>({
  option,
  selected,
  disabled,
  onChange,
  testID,
}: RowProps<K>) {
  const { pressed, handlers } = usePressed();
  const textColor = selected ? 'onAccent' : 'ink';
  // Pressed = a 2px border (not colour alone). Padding gives back the extra pixel so nothing shifts.
  const heavy = pressed && !disabled;
  const borderWidth = heavy ? 2 : 1;
  const padV = space.grid - (borderWidth - 1);
  const padH = space.cardPad - (borderWidth - 1);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={[option.label, option.sub, option.amount].filter((part) => Boolean(part)).join(', ')}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => onChange(option.key)}
      {...handlers}
      testID={testID}
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.grid,
        paddingVertical: padV,
        paddingHorizontal: padH,
        borderWidth,
        borderStyle: disabled ? 'dashed' : 'solid',
        borderColor: selected ? color.accent : color.line,
        backgroundColor: selected ? color.accent : 'transparent',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        testID={`${testID}-tick`}
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
        <Text variant="numXS" color={textColor} numberOfLines={1} style={{ flexShrink: 0 }}>
          {option.amount}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Choice rows (design.md 6.11): a radio group of square-ticked rows. Never default radio dots. */
export function ChoiceRows<K extends string>({
  options,
  value,
  onChange,
  disabled = false,
  testID = 'choice-rows',
}: ChoiceRowsProps<K>) {
  return (
    <View accessibilityRole="radiogroup" testID={testID} style={{ gap: space.grid }}>
      {options.map((option) => (
        <ChoiceRow
          key={option.key}
          option={option}
          selected={option.key === value}
          disabled={disabled}
          onChange={onChange}
          testID={`${testID}-${option.key}`}
        />
      ))}
    </View>
  );
}
