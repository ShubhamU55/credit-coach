import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color, fontFamily } from '../theme';
import { Text } from './Text';

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe('Text', () => {
  test('number variants are tabular by default', async () => {
    await render(
      <Text variant="numL" testID="t">
        45.0%
      </Text>,
    );

    expect(styleOf('t').fontVariant).toContain('tabular-nums');
  });

  test('tabular can be switched off on a number variant', async () => {
    await render(
      <Text variant="numL" tabular={false} testID="t">
        45
      </Text>,
    );

    expect(styleOf('t').fontVariant).toBeUndefined();
  });

  test('tabular can be switched on for a non-number variant', async () => {
    await render(
      <Text variant="body" tabular testID="t">
        1,20,000
      </Text>,
    );

    expect(styleOf('t').fontVariant).toContain('tabular-nums');
  });

  test('h1 has the header role', async () => {
    await render(<Text variant="h1">Hello</Text>);

    expect(screen.getByRole('header')).toBeOnTheScreen();
  });

  test('other variants have no header role', async () => {
    await render(<Text variant="body">Hello</Text>);

    expect(screen.queryByRole('header')).toBeNull();
  });

  test('applies the type scale entry for the variant', async () => {
    await render(
      <Text variant="numXL" testID="t">
        708
      </Text>,
    );

    expect(styleOf('t')).toMatchObject({
      fontFamily: fontFamily.sans800,
      fontSize: 64,
      lineHeight: 66,
    });
  });

  test.each([
    ['h1', 'ink'],
    ['numM', 'ink'],
    ['title', 'ink'],
    ['body', 'body'],
    ['bodyS', 'body'],
    ['caption', 'muted'],
    ['overline', 'muted'],
    ['micro', 'muted'],
  ] as const)('%s defaults to the %s color', async (variant, token) => {
    await render(
      <Text variant={variant} testID="t">
        x
      </Text>,
    );

    expect(styleOf('t').color).toBe(color[token]);
  });

  test('color prop picks a token and overrides the default', async () => {
    await render(
      <Text variant="body" color="warning" testID="t">
        x
      </Text>,
    );

    expect(styleOf('t').color).toBe(color.warning);
  });

  test('a caller style wins over the variant style', async () => {
    await render(
      <Text variant="body" style={{ textAlign: 'center' }} testID="t">
        x
      </Text>,
    );

    expect(styleOf('t').textAlign).toBe('center');
  });

  test('allows font scaling', async () => {
    await render(
      <Text variant="body" testID="t">
        x
      </Text>,
    );

    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false);
  });
});
