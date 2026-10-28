import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color, shadow } from '../theme';
import { PopButton, SecondaryButton, TextAction } from './Buttons';

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe('PopButton', () => {
  test('has the button role and the original label as its accessible name', async () => {
    await render(<PopButton label="Try sample profile" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Try sample profile' })).toBeOnTheScreen();
  });

  test('renders its label in uppercase', async () => {
    await render(<PopButton label="Try sample profile" onPress={() => {}} />);

    expect(screen.getByText('TRY SAMPLE PROFILE')).toBeOnTheScreen();
  });

  test('is 56 tall by default and 48 tall in a list', async () => {
    await render(
      <>
        <PopButton label="Screen" onPress={() => {}} testID="a" />
        <PopButton label="List" size="list" onPress={() => {}} testID="b" />
      </>,
    );

    expect(styleOf('a').height).toBe(56);
    expect(styleOf('b').height).toBe(48);
  });

  test('is accent filled with an onAccent label and the pop shadow', async () => {
    await render(<PopButton label="Go" onPress={() => {}} testID="a" />);

    expect(styleOf('a')).toMatchObject({ backgroundColor: color.accent, boxShadow: shadow.pop });
    expect(StyleSheet.flatten(screen.getByText('GO').props.style).color).toBe(color.onAccent);
  });

  test('has square corners', async () => {
    await render(<PopButton label="Go" onPress={() => {}} testID="a" />);

    expect(styleOf('a').borderRadius ?? 0).toBe(0);
  });

  test('onHero uses the shadow made for card finishes', async () => {
    await render(<PopButton label="Go" onHero onPress={() => {}} testID="a" />);

    expect(styleOf('a').boxShadow).toBe(shadow.popOnHero);
  });

  test('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<PopButton label="Go" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled: does not fire, reports disabled, has no shadow and a hairline fill', async () => {
    const onPress = jest.fn();
    await render(<PopButton label="Go" disabled onPress={onPress} testID="a" />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(styleOf('a').boxShadow).toBeUndefined();
    expect(styleOf('a').backgroundColor).toBe(color.hairline);
    expect(StyleSheet.flatten(screen.getByText('GO').props.style).color).toBe(color.muted);
  });

  test('trailingArrow adds a decorative arrow that is not read out', async () => {
    await render(<PopButton label="Continue" trailingArrow onPress={() => {}} />);

    expect(screen.getByText('→', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen();
  });

  test('keeps a 48dp touch target', async () => {
    await render(<PopButton label="Go" size="list" onPress={() => {}} testID="a" />);

    expect(styleOf('a').minHeight).toBeGreaterThanOrEqual(48);
  });
});

describe('SecondaryButton', () => {
  test('has a 1px line border, no shadow and is 48 tall', async () => {
    await render(<SecondaryButton label="Undo" onPress={() => {}} testID="s" />);

    expect(styleOf('s')).toMatchObject({ borderWidth: 1, borderColor: color.line, height: 48 });
    expect(styleOf('s').boxShadow).toBeUndefined();
  });

  test('uses an ink label, uppercase, and the button role', async () => {
    await render(<SecondaryButton label="Undo" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('UNDO').props.style).color).toBe(color.ink);
  });

  test('calls onPress, and does not when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <SecondaryButton label="On" onPress={onPress} testID="on" />
        <SecondaryButton label="Off" disabled onPress={onPress} testID="off" />
      </>,
    );

    await fireEvent.press(screen.getByTestId('off'));
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('on'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('off')).toBeDisabled();
  });
});

describe('TextAction', () => {
  test('has the link role and a touch target of at least 48', async () => {
    await render(<TextAction label="View full plan" onPress={() => {}} testID="t" />);

    expect(screen.getByRole('link', { name: 'View full plan' })).toBeOnTheScreen();
    expect(styleOf('t').minHeight).toBeGreaterThanOrEqual(48);
  });

  test('is uppercase in the link color, and ink when on a card finish', async () => {
    await render(
      <>
        <TextAction label="Manage" onPress={() => {}} />
        <TextAction label="Switch" onFinish onPress={() => {}} />
      </>,
    );

    expect(StyleSheet.flatten(screen.getByText('MANAGE').props.style).color).toBe(color.link);
    expect(StyleSheet.flatten(screen.getByText('SWITCH').props.style).color).toBe(color.ink);
  });

  test('has no underline and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<TextAction label="Manage" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('link'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByText('MANAGE').props.style).textDecorationLine).not.toBe(
      'underline',
    );
  });
});
