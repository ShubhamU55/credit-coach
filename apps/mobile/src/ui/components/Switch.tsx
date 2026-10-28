import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, shadow, space } from '../theme';

export type SwitchRowProps = {
  title: string;
  /** Says what changes when it is on. */
  captionOn: string;
  /** Says what changes when it is off. */
  captionOff: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
};

const TRACK_WIDTH = 56;
const TRACK_HEIGHT = 30;
const THUMB = 22;
const INSET = 3;
const BORDER = 1;
// Thumb travels from the left inset to the right inset of the track's padding box.
const THUMB_LEFT_OFF = INSET;
const THUMB_LEFT_ON = TRACK_WIDTH - 2 * BORDER - THUMB - INSET;
const THUMB_TOP = (TRACK_HEIGHT - 2 * BORDER - THUMB) / 2;

/** Switch row (design.md 6.10): the whole row is the control; the caption says what changes. */
export function SwitchRow({
  title,
  captionOn,
  captionOff,
  value,
  onValueChange,
  testID = 'switch-row',
}: SwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={value ? captionOn : captionOff}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      testID={testID}
      style={{
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.cardPad,
        paddingVertical: space.grid,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        <Text variant="bodyS" color="muted">
          {value ? captionOn : captionOff}
        </Text>
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        testID={`${testID}-track`}
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderWidth: BORDER,
          borderColor: value ? color.accent : color.line,
          backgroundColor: value ? color.accent : color.surface2,
        }}
      >
        <View
          testID={`${testID}-thumb`}
          style={{
            position: 'absolute',
            top: THUMB_TOP,
            left: value ? THUMB_LEFT_ON : THUMB_LEFT_OFF,
            width: THUMB,
            height: THUMB,
            backgroundColor: value ? color.bg : color.ink,
            boxShadow: value ? shadow.switchThumbOn : shadow.switchThumbOff,
          }}
        />
      </View>
    </Pressable>
  );
}
