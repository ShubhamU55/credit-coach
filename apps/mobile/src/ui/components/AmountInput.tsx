import { useImperativeHandle, useRef, type ComponentRef, type Ref } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, fontFamily, space, type } from '../theme';

/** The instance type of a TextInput (what its ref points at). */
export type AmountInputHandle = ComponentRef<typeof TextInput>;

export type AmountStatus = 'default' | 'error' | 'warning';

export type AmountInputProps = {
  label: string;
  /** Digits only, integer rupees. */
  value: string;
  /** Called with digits only. A paste that cannot be read safely is rejected (not called). */
  onChangeText: (digits: string) => void;
  helper?: string;
  status?: AmountStatus;
  /** Shown under the field in the status color. The copy itself must say what is wrong (never colour alone). */
  message?: string;
  /** Borderless Number M variant for editing a figure inside a card. */
  inline?: boolean;
  /** Ref to the TextInput, so a screen can focus it (for example from an "EDIT" action). */
  ref?: Ref<AmountInputHandle>;
  testID?: string;
};

/** 9 digits keeps every value a safe integer and far above any credit-card limit in rupees. */
export const MAX_AMOUNT_DIGITS = 9;

/**
 * Turns typed or pasted text into integer-rupee digits, or null when it must be rejected.
 * "₹1,200.50" becomes "1200": the decimal tail is cut first, so paise never become rupees.
 * Leading zeros are dropped ("007" becomes "7", "000" stays "0"). More than 9 digits is
 * rejected rather than truncated, because a truncated paste would silently be a wrong amount.
 */
export function sanitizeAmount(text: string): string | null {
  const wholePart = text.split('.')[0];
  const digits = wholePart.replace(/\D/g, '');
  if (digits.length > MAX_AMOUNT_DIGITS) return null;
  if (digits === '') return '';
  return digits.replace(/^0+(?=\d)/, '');
}

const boxedField = {
  minHeight: 50,
  paddingHorizontal: space.grid,
  marginTop: 6,
  backgroundColor: color.bg,
} as const;

const inlineField = {
  minHeight: space.touch,
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

/**
 * Amount input (design.md 6.12). Integer rupees, `number-pad`, status via a 2px border plus a message.
 * The whole field (prefix and edges included) is a 48dp+ target that focuses the input. The message
 * sits in an always-mounted live region and is also the input's hint, so focusing it reads the error.
 */
export function AmountInput({
  label,
  value,
  onChangeText,
  helper,
  status = 'default',
  message,
  inline,
  ref,
  testID = 'amount-input',
}: AmountInputProps) {
  const inputRef = useRef<AmountInputHandle>(null);
  useImperativeHandle(ref, () => inputRef.current as AmountInputHandle, []);
  const flagged = status !== 'default';
  return (
    <View>
      {inline ? null : <Text variant="overline">{label}</Text>}
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        testID={`${testID}-field`}
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 6,
          ...(inline ? inlineField : boxedField),
          borderWidth: borderWidthFor(Boolean(inline), status),
          borderColor: BORDER_COLOR[status],
        }}
      >
        <View style={{ justifyContent: 'center' }}>
          <Text variant={inline ? 'numM' : 'title'} color="muted" accessible={false}>
            ₹
          </Text>
        </View>
        <TextInput
          ref={inputRef}
          accessibilityLabel={`${label}, in rupees`}
          accessibilityHint={message || undefined}
          keyboardType="number-pad"
          value={value}
          onChangeText={(text) => {
            const next = sanitizeAmount(text);
            if (next !== null) onChangeText(next);
          }}
          placeholderTextColor={color.muted}
          selectionColor={color.accent}
          testID={testID}
          style={[
            inline ? type.numM : { ...type.title, fontFamily: fontFamily.sans800, fontSize: 18 },
            {
              flex: 1,
              alignSelf: 'stretch',
              minHeight: space.touch,
              color: color.ink,
              padding: 0,
              fontVariant: ['tabular-nums'],
            },
          ]}
        />
      </Pressable>
      {helper ? (
        <Text variant="caption" style={{ marginTop: 6 }}>
          {helper}
        </Text>
      ) : null}
      <Text
        variant="bodyS"
        color={flagged ? status : 'muted'}
        accessibilityLiveRegion="polite"
        testID={`${testID}-message`}
        style={{ marginTop: message ? 6 : 0, fontFamily: fontFamily.sans700 }}
      >
        {message ?? ''}
      </Text>
    </View>
  );
}
