import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, fontFamily, shadow, space } from '../theme';
import { SampleStrip } from './SampleStrip';

export type HeaderProps = {
  /** For example `AM`. */
  initials: string;
  /** Count of new reminders. Zero hides the dot. */
  remindersNew: number;
  onReminders: () => void;
  onAccount: () => void;
  /** Present while the sample profile is active: shows the "Sample profile · Switch" strip. */
  sample?: { onSwitch: () => void };
};

const LOGO_SIZE = 36;
const LOGO_SHADOW = 3;
const DOT = 7;

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** A small bell drawn from squares (no icon dependency). Decorative. */
function BellIcon() {
  return (
    <View {...hidden} style={{ alignItems: 'center', gap: 1 }}>
      <View style={{ width: 14, height: 12, borderWidth: 2, borderColor: color.ink }} />
      <View style={{ width: 4, height: 2, backgroundColor: color.ink }} />
    </View>
  );
}

/**
 * App header (design.md 6.18): the monogram, a reminders button and the initials tile, with the
 * sample strip below while the sample profile is active.
 */
export function Header({ initials, remindersNew, onReminders, onAccount, sample }: HeaderProps) {
  const hasNew = remindersNew > 0;
  return (
    <View style={{ paddingTop: 18, gap: space.grid }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* PLACEHOLDER monogram: replace with the final logo before ship (design.md 6.18, 12). */}
        <View
          testID="header-logo-placeholder"
          accessible
          accessibilityLabel="Credit Coach"
          style={{
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            marginRight: LOGO_SHADOW,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color.ink,
            boxShadow: shadow.logo,
          }}
        >
          <Text
            variant="voice"
            color="bg"
            style={{ fontFamily: fontFamily.serifSemi }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            cc
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            testID="header-reminders"
            accessibilityRole="button"
            accessibilityLabel={hasNew ? `Reminders, ${remindersNew} new` : 'Reminders'}
            onPress={onReminders}
            style={{
              minWidth: space.touch,
              minHeight: space.touch,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: color.hairline,
            }}
          >
            <BellIcon />
            {hasNew ? (
              <View
                testID="header-reminders-dot"
                {...hidden}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: color.warning,
                }}
              />
            ) : null}
          </Pressable>
          <Pressable
            testID="header-account"
            accessibilityRole="button"
            accessibilityLabel={`${initials}, account settings`}
            onPress={onAccount}
            style={{
              minWidth: space.touch,
              minHeight: space.touch,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: color.surface2,
            }}
          >
            <Text variant="buttonS" numberOfLines={1}>
              {initials}
            </Text>
          </Pressable>
        </View>
      </View>
      {sample ? <SampleStrip onSwitch={sample.onSwitch} /> : null}
    </View>
  );
}
