import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text as RNText, View } from 'react-native';
import { announce } from '../primitives/announce';
import { RECORD_NOTE } from './Disclaimer';
import { BottomSheet } from './BottomSheet';
import { FloatingNav } from './FloatingNav';
import { Screen } from './Screen';
import { SwitchRow } from './Switch';

jest.mock('../primitives/announce', () => ({ announce: jest.fn() }));

// The first Modal render is slow on a cold Jest worker under load.
jest.setTimeout(20000);

afterEach(() => jest.clearAllMocks());

describe('RECORD_NOTE', () => {
  test('is the fixed mark-as-paid copy from design.md section 1', () => {
    expect(RECORD_NOTE).toBe('This only records it here. Pay in your bank or UPI app.');
  });
});

describe('Screen without scroll', () => {
  test('still pads the bottom by the nav clearance so the nav never covers the disclaimer', async () => {
    await render(
      <Screen>
        <RNText>content</RNText>
      </Screen>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).paddingBottom).toBe(120);
  });
});

describe('FloatingNav selection', () => {
  test('only Cards is selected when active is cards, and Score fires onNavigate("score")', async () => {
    const onNavigate = jest.fn();
    await render(<FloatingNav active="cards" onNavigate={onNavigate} />);

    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Cards' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Home' })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Score' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('score');
  });
});

describe('SwitchRow announcement', () => {
  test('goes through the shared announce() helper', async () => {
    await render(
      <SwitchRow
        title="Aim for 10%"
        captionOn="Only 10% gets reported."
        captionOff="Staying under 30%."
        value={false}
        onValueChange={() => {}}
      />,
    );

    await fireEvent.press(screen.getByRole('switch'));

    expect(announce).toHaveBeenCalledWith('Only 10% gets reported.');
  });
});

describe('BottomSheet focus', () => {
  function Harness({ visible }: { visible: boolean }) {
    const trigger = useRef<ComponentRef<typeof View>>(null);
    return (
      <>
        <View ref={trigger} testID="trigger" accessible />
        <BottomSheet
          visible={visible}
          title="MARK AS PAID"
          subtitle="Axis Neo"
          onClose={() => {}}
          returnFocusRef={trigger}
        >
          <RNText>inside</RNText>
        </BottomSheet>
      </>
    );
  }

  test('opening moves screen-reader focus to the title and announces it', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    await render(<Harness visible />);

    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(announce).toHaveBeenCalledWith('MARK AS PAID, Axis Neo');
  });

  test('a sheet that is not open moves no focus and announces nothing', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    await render(<Harness visible={false} />);

    expect(send).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  test('closing returns focus to the trigger the caller supplied', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    await render(<Harness visible />);
    send.mockClear();

    await screen.rerender(<Harness visible={false} />);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  test('without a returnFocusRef, closing sends no focus event', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    const sheet = (visible: boolean) => (
      <BottomSheet visible={visible} title="T" onClose={() => {}}>
        <RNText>inside</RNText>
      </BottomSheet>
    );
    await render(sheet(true));
    send.mockClear();

    await screen.rerender(sheet(false));

    expect(send).not.toHaveBeenCalled();
  });
});
