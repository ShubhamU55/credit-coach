import { View } from 'react-native';

import { SampleStrip, Text, color, fontFamily, shadow, space } from '../../ui';

const LOGO_SIZE = 36;
const LOGO_SHADOW = 3;

/**
 * Home header: the monogram and, while the sample is active, the "Sample profile · Switch" strip.
 *
 * The kit `Header` also draws a reminders button and an account tile that must have a handler, and
 * neither screen exists yet. A button that does nothing would be announced as a working button, so
 * Home composes the header from the kit's own parts and leaves those two out until their screens
 * land (ledger: the kit `Header` should make both handlers optional).
 */
export function HomeHeader({ onSwitch }: { onSwitch?: () => void }) {
  return (
    <View style={{ paddingTop: 18, gap: space.grid }}>
      {/* PLACEHOLDER monogram: replace with the final logo before ship (design.md 6.18, 12). */}
      <View
        testID="home-logo"
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
      {onSwitch ? <SampleStrip onSwitch={onSwitch} /> : null}
    </View>
  );
}
