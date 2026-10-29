import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text as RNText } from 'react-native';
import { announce } from '../primitives/announce';

import { color, fontFamily, shadow } from '../theme';
import { FloatingNav } from './FloatingNav';
import { Header } from './Header';
import { Screen } from './Screen';

const hidden = { includeHiddenElements: true } as const;

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style);
}

afterEach(() => jest.restoreAllMocks());

describe('Header', () => {
  const props = { initials: 'AM', remindersNew: 1, onReminders: () => {}, onAccount: () => {} };

  test('the reminders button names the count of new reminders', async () => {
    await render(<Header {...props} remindersNew={1} />);

    expect(screen.getByRole('button', { name: 'Reminders, 1 new' })).toBeOnTheScreen();
  });

  test('with nothing new the label has no count and there is no dot', async () => {
    await render(<Header {...props} remindersNew={0} />);

    expect(screen.getByRole('button', { name: 'Reminders' })).toBeOnTheScreen();
    expect(screen.queryByTestId('header-reminders-dot', hidden)).toBeNull();
  });

  test('a new reminder shows a 7px warning dot that screen readers skip', async () => {
    await render(<Header {...props} remindersNew={2} />);

    expect(styleOf('header-reminders-dot')).toMatchObject({
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: color.warning,
    });
    expect(screen.queryByTestId('header-reminders-dot')).toBeNull();
  });

  test('the initials tile is labelled with the initials and "account settings"', async () => {
    await render(<Header {...props} initials="AM" />);

    expect(screen.getByRole('button', { name: 'AM, account settings' })).toBeOnTheScreen();
    expect(screen.getByText('AM')).toBeOnTheScreen();
  });

  test('pressing the buttons calls the handlers', async () => {
    const onReminders = jest.fn();
    const onAccount = jest.fn();
    await render(<Header {...props} onReminders={onReminders} onAccount={onAccount} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Reminders, 1 new' }));
    await fireEvent.press(screen.getByRole('button', { name: 'AM, account settings' }));

    expect(onReminders).toHaveBeenCalledTimes(1);
    expect(onAccount).toHaveBeenCalledTimes(1);
  });

  test('both buttons are 48dp, square, with the specified fills and borders', async () => {
    await render(<Header {...props} />);

    expect(styleOf('header-reminders')).toMatchObject({
      minWidth: 48,
      minHeight: 48,
      borderWidth: 1,
      borderColor: color.hairline,
    });
    expect(styleOf('header-account')).toMatchObject({
      minWidth: 48,
      minHeight: 48,
      backgroundColor: color.surface2,
    });
    expect(styleOf('header-reminders').borderRadius ?? 0).toBe(0);
    expect(styleOf('header-account').borderRadius ?? 0).toBe(0);
  });

  test('the placeholder monogram is a 36 square ink tile with the logo shadow and Fraunces 600', async () => {
    await render(<Header {...props} />);

    expect(styleOf('header-logo-placeholder')).toMatchObject({
      width: 36,
      height: 36,
      backgroundColor: color.ink,
      boxShadow: shadow.logo,
    });
    const mark = StyleSheet.flatten(screen.getByText('cc', hidden).props.style);
    expect(mark).toMatchObject({ fontFamily: fontFamily.serifSemi, color: color.bg });
    expect(mark.fontSize).toBeGreaterThanOrEqual(18); // Fraunces never below 18
  });

  test('has no sample strip unless sample is passed', async () => {
    await render(<Header {...props} />);

    expect(screen.queryByTestId('sample-strip')).toBeNull();
  });

  test('with sample it shows the strip and wires Switch', async () => {
    const onSwitch = jest.fn();
    await render(<Header {...props} sample={{ onSwitch }} />);

    expect(screen.getByTestId('sample-strip')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: 'Switch' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});

describe('FloatingNav', () => {
  test('exactly one tab is selected: the active one', async () => {
    await render(<FloatingNav active="plan" onNavigate={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Plan' })).toBeSelected();
    for (const name of ['Home', 'Score', 'Cards']) {
      expect(screen.getByRole('tab', { name })).not.toBeSelected();
    }
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  });

  test('pressing a tab calls onNavigate with its key', async () => {
    const onNavigate = jest.fn();
    await render(<FloatingNav active="plan" onNavigate={onNavigate} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Score' }));

    expect(onNavigate).toHaveBeenCalledWith('score');
  });

  test.each([
    ['Home', 'home'],
    ['Plan', 'plan'],
    ['Score', 'score'],
    ['Cards', 'cards'],
  ])('%s navigates to %s', async (name, key) => {
    const onNavigate = jest.fn();
    await render(<FloatingNav active="home" onNavigate={onNavigate} />);

    await fireEvent.press(screen.getByRole('tab', { name }));

    expect(onNavigate).toHaveBeenCalledWith(key);
  });

  test('only the active tab has the 4px accent dot', async () => {
    await render(<FloatingNav active="cards" onNavigate={() => {}} />);

    expect(styleOf('nav-dot-cards')).toMatchObject({
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: color.accent,
    });
    for (const key of ['home', 'plan', 'score']) {
      expect(screen.queryByTestId(`nav-dot-${key}`, hidden)).toBeNull();
    }
  });

  test('the active label is ink and the others muted (the dot is the non-colour cue)', async () => {
    await render(<FloatingNav active="home" onNavigate={() => {}} />);

    const labelColor = (name: string) =>
      StyleSheet.flatten(screen.getByText(name).props.style).color;
    expect(labelColor('Home')).toBe(color.ink);
    expect(labelColor('Plan')).toBe(color.muted);
  });

  test('the bar floats: absolute, 16 in from each side, 20 up, at least 68 tall', async () => {
    await render(<FloatingNav active="home" onNavigate={() => {}} />);

    expect(styleOf('floating-nav')).toMatchObject({
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 20,
      minHeight: 68,
      backgroundColor: color.surface,
      borderWidth: 1,
      borderColor: color.lineStrong,
      boxShadow: shadow.nav,
    });
    expect(styleOf('floating-nav').height).toBeUndefined();
    expect(styleOf('floating-nav').borderRadius ?? 0).toBe(0);
  });

  test('is a tab list and every tab is at least 48dp', async () => {
    await render(<FloatingNav active="home" onNavigate={() => {}} />);

    expect(screen.getByTestId('floating-nav', hidden)).toHaveProp('accessibilityRole', 'tablist');
    for (const key of ['home', 'plan', 'score', 'cards']) {
      expect(styleOf(`nav-tab-${key}`).minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('Screen', () => {
  test('scroll: pads the bottom by the nav clearance of 120 and the sides by the 20 gutter', async () => {
    await render(
      <Screen scroll>
        <RNText>content</RNText>
      </Screen>,
    );

    const scroll = screen.getByTestId('screen-scroll');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
      paddingBottom: 120,
      paddingHorizontal: 20,
    });
  });

  test('the disclaimer is the last child, after the content', async () => {
    await render(
      <Screen scroll>
        <RNText>first</RNText>
        <RNText>second</RNText>
      </Screen>,
    );

    const disclaimer = screen.getByTestId('disclaimer');
    const siblings = disclaimer.parent?.children ?? [];
    expect(siblings[siblings.length - 1]).toBe(disclaimer);
    expect(siblings.length).toBeGreaterThan(1);
  });

  test('without scroll it still ends with the disclaimer and uses no ScrollView', async () => {
    await render(
      <Screen>
        <RNText>content</RNText>
      </Screen>,
    );

    expect(screen.queryByTestId('screen-scroll', hidden)).toBeNull();
    const disclaimer = screen.getByTestId('disclaimer');
    const siblings = disclaimer.parent?.children ?? [];
    expect(siblings[siblings.length - 1]).toBe(disclaimer);
  });

  test('has the bg background and fills the screen', async () => {
    await render(
      <Screen>
        <RNText>content</RNText>
      </Screen>,
    );

    expect(styleOf('screen')).toMatchObject({ flex: 1, backgroundColor: color.bg });
  });

  test('the disclaimer is the fixed copy', async () => {
    await render(
      <Screen scroll>
        <RNText>content</RNText>
      </Screen>,
    );

    expect(screen.getByTestId('disclaimer')).toHaveTextContent(
      'Estimates only. Not your official CIBIL score. Not financial advice.',
      { exact: true },
    );
  });
});

describe('announce', () => {
  test('passes the message to the screen reader', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();

    announce('Recorded ₹12,400.');

    expect(spy).toHaveBeenCalledWith('Recorded ₹12,400.');
  });
});
