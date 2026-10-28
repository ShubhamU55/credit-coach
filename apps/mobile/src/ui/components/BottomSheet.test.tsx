import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text as RNText } from 'react-native';
import { useReduceMotion } from '../primitives/useReduceMotion';
import { color } from '../theme';
import { BottomSheet } from './BottomSheet';

jest.mock('../primitives/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const hidden = { includeHiddenElements: true } as const;

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style);
}

afterEach(() => {
  jest.mocked(useReduceMotion).mockReturnValue(false);
});

describe('BottomSheet', () => {
  const baseProps = {
    title: 'MARK AS PAID',
    subtitle: 'Axis Neo · due Thu, 22 Oct',
    onClose: () => {},
  };

  test('renders nothing when not visible', async () => {
    await render(
      <BottomSheet {...baseProps} visible={false}>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(screen.queryByText('inside')).toBeNull();
    expect(screen.queryByText('MARK AS PAID')).toBeNull();
  });

  test('visible: shows the title, subtitle and children', async () => {
    await render(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(screen.getByText('MARK AS PAID')).toBeOnTheScreen();
    expect(screen.getByText('Axis Neo · due Thu, 22 Oct')).toBeOnTheScreen();
    expect(screen.getByText('inside')).toBeOnTheScreen();
  });

  test('the sheet is modal for screen readers', async () => {
    await render(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(screen.getByTestId('bottom-sheet')).toHaveProp('accessibilityViewIsModal', true);
  });

  test('the first pressable in the sheet is Close, even with a button in the content', async () => {
    await render(
      <BottomSheet {...baseProps} visible>
        <RNText accessibilityRole="button" onPress={() => {}}>
          Confirm payment
        </RNText>
      </BottomSheet>,
    );

    const buttons = within(screen.getByTestId('bottom-sheet')).getAllByRole('button');
    expect(buttons[0]).toHaveProp('accessibilityLabel', 'Close');
  });

  test('Close is a 48dp button that calls onClose', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet {...baseProps} visible onClose={onClose}>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    const close = screen.getByRole('button', { name: 'Close' });
    expect(StyleSheet.flatten(close.props.style)).toMatchObject({ minWidth: 48, minHeight: 48 });
    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the Android back button and a tap on the scrim both close it', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet {...baseProps} visible onClose={onClose}>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    screen.getByTestId('bottom-sheet-modal').props.onRequestClose();
    await fireEvent.press(screen.getByTestId('bottom-sheet-scrim', hidden));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('the scrim is the scrim token and the sheet is a square surface with a line top border', async () => {
    await render(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(styleOf('bottom-sheet-scrim').backgroundColor).toBe(color.scrim);
    expect(styleOf('bottom-sheet')).toMatchObject({
      backgroundColor: color.surface,
      borderTopWidth: 1,
      borderTopColor: color.line,
      paddingTop: 12,
      paddingHorizontal: 20,
      paddingBottom: 28,
    });
    expect(styleOf('bottom-sheet').borderRadius ?? 0).toBe(0);
  });

  test('draws a 40 by 4 square grabber that screen readers skip', async () => {
    await render(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(styleOf('bottom-sheet-grabber')).toMatchObject({ width: 40, height: 4 });
    expect(screen.queryByTestId('bottom-sheet-grabber')).toBeNull();
  });

  test('slides in normally and fades when reduce motion is on', async () => {
    const reduce = jest.mocked(useReduceMotion);
    reduce.mockReturnValue(false);
    const { rerender } = await render(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );
    expect(screen.getByTestId('bottom-sheet-modal')).toHaveProp('animationType', 'slide');

    reduce.mockReturnValue(true);
    await rerender(
      <BottomSheet {...baseProps} visible>
        <RNText>inside</RNText>
      </BottomSheet>,
    );
    expect(screen.getByTestId('bottom-sheet-modal')).toHaveProp('animationType', 'fade');
  });

  test('the subtitle is optional', async () => {
    await render(
      <BottomSheet title="MARK AS PAID" visible onClose={() => {}}>
        <RNText>inside</RNText>
      </BottomSheet>,
    );

    expect(screen.getByText('MARK AS PAID')).toBeOnTheScreen();
  });
});
