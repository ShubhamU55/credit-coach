import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { space } from '../theme';
import { FloatingNav } from './FloatingNav';
import { Screen } from './Screen';

const withInset = (bottom: number | null, node: React.ReactElement) =>
  bottom === null ? (
    node
  ) : (
    <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom }}>
      {node}
    </SafeAreaInsetsContext.Provider>
  );

const navBottom = () => StyleSheet.flatten(screen.getByTestId('floating-nav').props.style).bottom;

describe('FloatingNav bottom offset', () => {
  it.each([null, 0])('is unchanged (20) with no provider or an inset of 0: %s', async (inset) => {
    await render(withInset(inset, <FloatingNav active="home" onNavigate={() => {}} />));
    expect(navBottom()).toBe(20);
  });

  it('grows by the bottom inset (48 -> 68)', async () => {
    await render(withInset(48, <FloatingNav active="home" onNavigate={() => {}} />));
    expect(navBottom()).toBe(68);
  });
});

describe('Screen nav clearance', () => {
  const padding = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID).props.style ?? undefined);
  const scrollPad = () =>
    StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle)
      .paddingBottom;

  it.each([null, 0])('is unchanged with no provider or an inset of 0: %s', async (inset) => {
    await render(
      withInset(
        inset,
        <Screen scroll>
          <Text>x</Text>
        </Screen>,
      ),
    );
    expect(scrollPad()).toBe(space.navClearance);
  });

  it('grows by the inset for scrolling screens (48)', async () => {
    await render(
      withInset(
        48,
        <Screen scroll>
          <Text>x</Text>
        </Screen>,
      ),
    );
    expect(scrollPad()).toBe(space.navClearance + 48);
  });

  it('grows by the inset for fixed screens too (48), and is unchanged at 0', async () => {
    await render(
      withInset(
        48,
        <Screen>
          <Text>x</Text>
        </Screen>,
      ),
    );
    expect(padding('screen').paddingBottom).toBe(space.navClearance + 48);
  });
});
