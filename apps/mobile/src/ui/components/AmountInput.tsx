import { TextInput, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, fontFamily, space, type } from '../theme';

export type AmountStatus = 'default' | 'error' | 'warning';

export type AmountInputProps = {
  label: string;
  /** Digits only, integer rupees. */
  value: string;
  onChangeText: (digits: string) => void;
  helper?: string;
  status?: AmountStatus;
  /** Shown under the field in the status color. The copy itself must say what is wrong (never colour alone). */
  message?: string;
  /** Borderless Number M variant for editing a figure inside a card. */
  inline?: boolean;
  testID?: string;
};

const boxedField = {
  height: 50,
  paddingHorizontal: space.grid,
  marginTop: 6,
  backgroundColor: color.bg,
} as const;

const inlineField = {
  paddingHorizontal: 0,
  marginTop: 0,
  backgroundColor: 'transparent',
} as const;

const BORDER_COLOR = {
  default: color.line,
  error: color.error,
  warning: color.warning,
} as const;

function borderWidthFor(inline: boolean, status: AmountStatus): number {
  if (inline) return 0;
  return status === 'default' ? 1 : 2;
}

/** Amount input (design.md 6.12). Integer rupees, `number-pad`, status via a 2px border plus a message. */
export function AmountInput({
  label,
  value,
  onChangeText,
  helper,
  status = 'default',
  message,
  inline,
  testID = 'amount-input',
}: AmountInputProps) {
  const flagged = status !== 'default';
  return (
    <View>
      {inline ? null : <Text variant="overline">{label}</Text>}
      <View
        testID={`${testID}-field`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: space.touch,
          ...(inline ? inlineField : boxedField),
          borderWidth: borderWidthFor(Boolean(inline), status),
          borderColor: BORDER_COLOR[status],
        }}
      >
        <Text variant={inline ? 'numM' : 'title'} color="muted" accessible={false}>
          ₹
        </Text>
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, ''))}
          placeholderTextColor={color.muted}
          selectionColor={color.accent}
          testID={testID}
          style={[
            inline ? type.numM : { ...type.title, fontFamily: fontFamily.sans800, fontSize: 18 },
            { flex: 1, color: color.ink, padding: 0, fontVariant: ['tabular-nums'] },
          ]}
        />
      </View>
      {helper ? (
        <Text variant="caption" style={{ marginTop: 6 }}>
          {helper}
        </Text>
      ) : null}
      {message ? (
        <Text
          variant="bodyS"
          color={flagged ? status : 'muted'}
          accessibilityLiveRegion="polite"
          testID={`${testID}-message`}
          style={{ marginTop: 6, fontFamily: fontFamily.sans700 }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}
