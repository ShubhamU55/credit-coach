import type { ReactNode } from 'react';
import { Platform, ScrollView, StatusBar, View } from 'react-native';
import { color, space } from '../theme';
import { Disclaimer } from './Disclaimer';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolling screens pad the bottom by the nav clearance so the floating nav never covers the disclaimer. */
  scroll?: boolean;
};

/**
 * Top inset. RN's `SafeAreaView` is deprecated (and a plain `View` on Android), and there is no
 * `react-native-safe-area-context` in this app yet, so the status bar height is used on Android.
 * Swap this for the real insets when that dependency is added in a setup task.
 */
function topInset(): number {
  return Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
}

/**
 * Screen shell (design.md 5, 6.17): `bg` background, 20 gutter, 28 between sections. The
 * disclaimer is always the last child (design.md section 1, rule 2).
 */
export function Screen({ children, scroll = false }: ScreenProps) {
  const content = (
    <>
      {children}
      <Disclaimer />
    </>
  );
  if (scroll) {
    return (
      <View testID="screen" style={{ flex: 1, backgroundColor: color.bg, paddingTop: topInset() }}>
        <ScrollView
          testID="screen-scroll"
          contentContainerStyle={{
            paddingHorizontal: space.gutter,
            paddingBottom: space.navClearance,
            gap: space.section,
          }}
        >
          {content}
        </ScrollView>
      </View>
    );
  }
  return (
    <View
      testID="screen"
      style={{
        flex: 1,
        backgroundColor: color.bg,
        paddingTop: topInset(),
        paddingHorizontal: space.gutter,
        paddingBottom: space.section,
        gap: space.section,
      }}
    >
      {content}
    </View>
  );
}
