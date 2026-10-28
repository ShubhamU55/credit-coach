import { Pressable } from 'react-native';
import { PopPressable } from '../primitives/PopPressable';
import { Text } from '../primitives/Text';
import { usePressed } from '../primitives/usePressed';
import { color, space } from '../theme';

type BaseButtonProps = {
  label: string;
  /** Overrides the screen-reader name when the visible label alone is ambiguous (for example "Mark as paid" on five steps). */
  accessibilityLabel?: string;
  onPress: () => void;
  testID?: string;
};

// A disabled control is dimmed as well as recoloured, so the state is not colour alone.
const DISABLED_OPACITY = 0.5;

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
  accessibilityLabel,
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
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={{
        // minHeight, not height: the label must not clip at 200% font scale.
        minHeight: size === 'list' ? space.touch : 56,
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
        <Text
          variant="button"
          color={labelColor}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          →
        </Text>
      ) : null}
    </PopPressable>
  );
}

export type SecondaryButtonProps = BaseButtonProps & { disabled?: boolean };

/**
 * Secondary button (design.md 6.2): transparent, 1px `line` border, ink label, 48 tall, no shadow.
 * Pressed = 2px border; disabled = dashed border and dimmed (neither is colour alone).
 */
export function SecondaryButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID = 'secondary-button',
}: SecondaryButtonProps) {
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      testID={testID}
      style={{
        minHeight: space.touch,
        minWidth: space.touch,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.cardPad,
        borderWidth: pressed && !disabled ? 2 : 1,
        borderColor: color.line,
        borderStyle: disabled ? 'dashed' : 'solid',
        opacity: disabled ? DISABLED_OPACITY : 1,
        backgroundColor: pressed && !disabled ? color.surface2 : 'transparent',
      }}
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
  disabled?: boolean;
};

/**
 * Text action (design.md 6.3): uppercase button text in `link` (`ink` on a card finish).
 * No underline at rest; pressed shows an underline; disabled is dimmed.
 */
export function TextAction({
  label,
  accessibilityLabel,
  onPress,
  onFinish = false,
  disabled = false,
  testID = 'text-action',
}: TextActionProps) {
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      testID={testID}
      style={{
        minHeight: space.touch,
        minWidth: space.touch,
        justifyContent: 'center',
        alignItems: 'flex-start',
        opacity: disabled ? DISABLED_OPACITY : 1,
      }}
    >
      <Text
        variant="buttonS"
        color={onFinish ? 'ink' : 'link'}
        style={{ textDecorationLine: pressed && !disabled ? 'underline' : 'none' }}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}
