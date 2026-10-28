import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { shadow, space } from '../theme';

export type PopShadowKind = 'pop' | 'popOnHero' | 'popSmall' | 'tileIdle' | 'cardTile' | 'hero';

// Hard-shadow offset in dp per kind (design.md section 4). The press translates by the same amount,
// and the idle margin keeps the shadow inside its column.
const OFFSET: Record<PopShadowKind, number> = {
  pop: 4,
  popOnHero: 4,
  cardTile: 4,
  popSmall: 3,
  tileIdle: 3,
  hero: 6,
};

export type PopPressableProps = Omit<PressableProps, 'style'> & {
  shadowKind: PopShadowKind;
  style?: StyleProp<ViewStyle>;
};

/**
 * The "pop" press (design.md section 4): idle = hard offset shadow; pressed = translate by the
 * offset and drop the shadow. Disabled = no shadow, no transform, no onPress.
 * The pressed state is applied in one frame, which is what reduce-motion asks for as well.
 */
export function PopPressable({
  shadowKind,
  disabled,
  style,
  accessibilityState,
  onPressIn,
  onPressOut,
  ...rest
}: PopPressableProps) {
  const [pressed, setPressed] = useState(false);
  const offset = OFFSET[shadowKind];
  const isDisabled = disabled === true;
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      disabled={isDisabled}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      style={[
        { minHeight: space.touch, minWidth: space.touch, marginRight: offset },
        style,
        isDisabled
          ? null
          : pressed
            ? {
                boxShadow: 'none',
                transform: [{ translateX: offset }, { translateY: offset }],
              }
            : { boxShadow: shadow[shadowKind] },
      ]}
    />
  );
}
