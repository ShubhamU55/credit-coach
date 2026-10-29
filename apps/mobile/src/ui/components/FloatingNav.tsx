import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, fontFamily, shadow, space } from '../theme';

export type NavTab = 'home' | 'plan' | 'score' | 'cards';

export type FloatingNavProps = {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
};

const TABS: readonly { key: NavTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'plan', label: 'Plan' },
  { key: 'score', label: 'Score' },
  { key: 'cards', label: 'Cards' },
];

const ICON = 22;
const DOT = 4;

/** Four tiny square icons drawn from Views (no icon dependency). Decorative. */
function NavIcon({ tab, tone }: { tab: NavTab; tone: string }) {
  const box = {
    width: ICON,
    height: ICON,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  switch (tab) {
    case 'home':
      return (
        <View style={box}>
          <View style={{ width: 18, height: 3, backgroundColor: tone }} />
          <View style={{ width: 14, height: 10, borderWidth: 2, borderColor: tone }} />
        </View>
      );
    case 'plan':
      return (
        <View style={{ ...box, gap: 4 }}>
          {[18, 14, 16].map((w) => (
            <View key={w} style={{ width: w, height: 2, backgroundColor: tone }} />
          ))}
        </View>
      );
    case 'score':
      return (
        <View style={{ ...box, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
          {[6, 11, 17].map((h) => (
            <View key={h} style={{ width: 4, height: h, backgroundColor: tone }} />
          ))}
        </View>
      );
    case 'cards':
      return (
        <View style={box}>
          <View style={{ width: 18, height: 12, borderWidth: 2, borderColor: tone }} />
          <View style={{ width: 18, height: 2, marginTop: 2, backgroundColor: tone }} />
        </View>
      );
  }
}

/**
 * Floating nav (design.md 6.17): four equal tabs. The active tab is ink, heavier, has a 4px
 * accent dot and `selected` state, so it is never colour alone.
 */
export function FloatingNav({ active, onNavigate }: FloatingNavProps) {
  return (
    <View
      testID="floating-nav"
      accessibilityRole="tablist"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 20,
        // minHeight, not height: the labels must not clip at 200% font scale.
        minHeight: 68,
        flexDirection: 'row',
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.lineStrong,
        boxShadow: shadow.nav,
      }}
    >
      {TABS.map(({ key, label }) => {
        const isActive = key === active;
        const tone = isActive ? color.ink : color.muted;
        return (
          <Pressable
            key={key}
            testID={`nav-tab-${key}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onNavigate(key)}
            style={{
              flex: 1,
              minHeight: space.touch,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <NavIcon tab={key} tone={tone} />
            </View>
            <Text
              variant="micro"
              numberOfLines={1}
              style={{
                color: tone,
                fontFamily: isActive ? fontFamily.sans800 : fontFamily.sans700,
              }}
            >
              {label}
            </Text>
            {isActive ? (
              <View
                testID={`nav-dot-${key}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: color.accent,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
