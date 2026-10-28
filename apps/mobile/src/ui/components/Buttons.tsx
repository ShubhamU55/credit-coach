import { Pressable } from 'react-native';
import { PopPressable } from '../primitives/PopPressable';
import { Text } from '../primitives/Text';
import { color, space } from '../theme';

type BaseButtonProps = {
  label: string;
  onPress: () => void;
  testID?: string;
};

export type PopButtonProps = BaseButtonProps & {
  /** `screen` = 56 tall screen CTA; `list` = 48 tall inside a list. */
  size?: 'screen' | 'list';
  /** On a card finish: uses the dark pop shadow. */
  onHero?: boolean;
  disabled?: boolean;
  trailingArrow?: boolean;
};

/** Primary "pop" button (design.md 6.1). One per view. Accent fill, hard offset shadow, square corners. */
export function PopButton({
  label,
  onPress,
  size,
  onHero,
  disabled,
  trailingArrow,
  testID = 'pop-button',
}: PopButtonProps) {
  const labelColor = disabled ? 'muted' : 'onAccent';
  return (
    <PopPressable
      shadowKind={onHero ? 'popOnHero' : 'pop'}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      style={{
        height: size === 'list' ? space.touch : 56,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: disabled ? color.hairline : color.accent,
      }}
    >
      <Text variant="button" color={labelColor}>
        {label.toUpperCase()}
      </Text>
      {trailingArrow ? (
        <Text variant="button" color={labelColor} accessible={false} importantForAccessibility="no">
          →
        </Text>
      ) : null}
    </PopPressable>
  );
}

export type SecondaryButtonProps = BaseButtonProps & { disabled?: boolean };

/** Secondary button (design.md 6.2): transparent, 1px `line` border, ink label, 48 tall, no shadow. */
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  testID = 'secondary-button',
}: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        height: space.touch,
        minWidth: space.touch,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.cardPad,
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: pressed ? color.surface2 : 'transparent',
      })}
    >
      <Text variant="buttonS" color={disabled ? 'muted' : 'ink'}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

export type TextActionProps = BaseButtonProps & {
  /** True when sitting on a card finish: ink instead of link. */
  onFinish?: boolean;
};

/** Text action (design.md 6.3): uppercase button text in `link` (`ink` on a card finish), no underline. */
export function TextAction({
  label,
  onPress,
  onFinish = false,
  testID = 'text-action',
}: TextActionProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: space.touch,
        minWidth: space.touch,
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <Text variant="buttonS" color={onFinish ? 'ink' : 'link'}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}
