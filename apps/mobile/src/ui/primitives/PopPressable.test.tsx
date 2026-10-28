import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { shadow } from '../theme';
import { PopPressable, type PopShadowKind } from './PopPressable';
import { Text } from './Text';

function styleOf(testID = 'pop') {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

function renderPop(
  props: Partial<React.ComponentProps<typeof PopPressable>> & { shadowKind?: PopShadowKind } = {},
) {
  return render(
    <PopPressable shadowKind="pop" testID="pop" onPress={() => {}} {...props}>
      <Text variant="body">Go</Text>
    </PopPressable>,
  );
}

describe('PopPressable', () => {
  test('idle: shows the shadow token and a right margin equal to the offset', async () => {
    await renderPop();

    expect(styleOf()).toMatchObject({ boxShadow: shadow.pop, marginRight: 4 });
    expect(styleOf().transform).toBeUndefined();
  });

  test('pressing translates by the offset and drops the shadow', async () => {
    await renderPop();

    await fireEvent(screen.getByTestId('pop'), 'pressIn');

    expect(styleOf()).toMatchObject({
      boxShadow: 'none',
      transform: [{ translateX: 4 }, { translateY: 4 }],
    });
  });

  test('releasing restores the idle style', async () => {
    await renderPop();

    await fireEvent(screen.getByTestId('pop'), 'pressIn');
    await fireEvent(screen.getByTestId('pop'), 'pressOut');

    expect(styleOf().boxShadow).toBe(shadow.pop);
    expect(styleOf().transform).toBeUndefined();
  });

  test.each([
    ['pop', 4],
    ['popOnHero', 4],
    ['cardTile', 4],
    ['popSmall', 3],
    ['tileIdle', 3],
    ['hero', 6],
  ] as const)('%s uses an offset of %i for both the margin and the press', async (kind, offset) => {
    await renderPop({ shadowKind: kind });
    expect(styleOf()).toMatchObject({ boxShadow: shadow[kind], marginRight: offset });

    await fireEvent(screen.getByTestId('pop'), 'pressIn');

    expect(styleOf().transform).toEqual([{ translateX: offset }, { translateY: offset }]);
  });

  test('calls onPress', async () => {
    const onPress = jest.fn();
    await renderPop({ onPress });

    await fireEvent.press(screen.getByTestId('pop'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled: onPress is not called and there is no shadow or transform', async () => {
    const onPress = jest.fn();
    await renderPop({ disabled: true, onPress });

    await fireEvent.press(screen.getByTestId('pop'));
    await fireEvent(screen.getByTestId('pop'), 'pressIn');

    expect(onPress).not.toHaveBeenCalled();
    expect(styleOf().boxShadow).toBeUndefined();
    expect(styleOf().transform).toBeUndefined();
  });

  test('disabled: reports accessibilityState.disabled', async () => {
    await renderPop({ disabled: true });

    expect(screen.getByTestId('pop')).toBeDisabled();
  });

  test("forwards the caller's onPressIn and onPressOut", async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await renderPop({ onPressIn, onPressOut });

    await fireEvent(screen.getByTestId('pop'), 'pressIn');
    await fireEvent(screen.getByTestId('pop'), 'pressOut');

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  test('enforces a 48dp minimum touch target', async () => {
    await renderPop();

    expect(styleOf()).toMatchObject({ minHeight: 48, minWidth: 48 });
  });

  test('a caller style is merged in and cannot remove the shadow', async () => {
    await renderPop({ style: { height: 56 } });

    expect(styleOf()).toMatchObject({ height: 56, boxShadow: shadow.pop });
  });
});
