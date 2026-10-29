import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color } from '../theme';
import { overlay } from '../theme/kitB';
import { AIExplanation } from './AIExplanation';
import { Disclaimer } from './Disclaimer';
import { ReasonRow } from './ReasonRow';
import { SampleStrip } from './SampleStrip';
import { StatTile } from './StatTile';
import { StatusChip } from './StatusChip';
import { UtilizationLabel } from './UtilizationLabel';

function styleOf(testID: string) {
  // Decorative parts (dots, tiles, bars) are hidden from screen readers on purpose.
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

function textStyle(text: string) {
  return StyleSheet.flatten(screen.getByText(text, { includeHiddenElements: true }).props.style);
}

describe('Disclaimer', () => {
  test('is the fixed copy from design.md section 1, character for character', async () => {
    await render(<Disclaimer />);

    expect(screen.getByTestId('disclaimer')).toHaveTextContent(
      'Estimates only. Not your official CIBIL score. Not financial advice.',
      { exact: true },
    );
  });

  test('is a muted 12/17 caption', async () => {
    await render(<Disclaimer />);

    expect(styleOf('disclaimer')).toMatchObject({
      color: color.muted,
      fontSize: 12,
      lineHeight: 17,
    });
  });
});

describe('StatusChip', () => {
  test.each([
    ['dueSoon', color.warningTint, color.warning],
    ['neutral', color.surface2, color.body],
    ['onFinish', overlay.onFinishChip, color.warning],
  ] as const)('%s uses its fill and text colour from tokens', async (variant, fill, text) => {
    await render(<StatusChip label="BY THU" variant={variant} testID="chip" />);

    expect(styleOf('chip').backgroundColor).toBe(fill);
    expect(textStyle('BY THU').color).toBe(text);
  });

  test('is square, never a pill', async () => {
    await render(<StatusChip label="BY THU" variant="neutral" testID="chip" />);

    expect(styleOf('chip').borderRadius ?? 0).toBe(0);
  });

  test('is at least 24 tall (minHeight so large text grows it)', async () => {
    await render(<StatusChip label="BY THU" variant="neutral" testID="chip" />);

    expect(styleOf('chip').minHeight).toBeGreaterThanOrEqual(24);
    expect(styleOf('chip').height).toBeUndefined();
  });

  test('the optional dot is a 6px decorative circle in the text colour', async () => {
    await render(<StatusChip label="BY THU" variant="dueSoon" dot testID="chip" />);

    expect(styleOf('chip-dot')).toMatchObject({
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: color.warning,
    });
    expect(screen.queryByTestId('chip-dot')).toBeNull(); // hidden from screen readers
  });

  test('no dot unless asked for', async () => {
    await render(<StatusChip label="BY THU" variant="neutral" testID="chip" />);

    expect(screen.queryByTestId('chip-dot', { includeHiddenElements: true })).toBeNull();
  });
});

describe('SampleStrip', () => {
  test('shows the sample profile label and an info dot', async () => {
    await render(<SampleStrip onSwitch={() => {}} />);

    expect(screen.getByText('SAMPLE PROFILE ·')).toBeOnTheScreen();
    expect(styleOf('sample-strip-dot')).toMatchObject({
      backgroundColor: color.info,
      width: 7,
      height: 7,
      borderRadius: 3.5,
    });
  });

  test('Switch is a link that calls onSwitch', async () => {
    const onSwitch = jest.fn();
    await render(<SampleStrip onSwitch={onSwitch} />);

    await fireEvent.press(screen.getByRole('link', { name: 'Switch' }));

    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  test('the Switch target is at least 48 tall', async () => {
    await render(<SampleStrip onSwitch={() => {}} />);

    expect(styleOf('sample-strip-switch').minHeight).toBeGreaterThanOrEqual(48);
  });
});

describe('AIExplanation', () => {
  const body = 'Pay Axis first so it is reported low.';

  test('aiWritten shows the fixed AI label and names it in the accessible label', async () => {
    await render(<AIExplanation text={body} aiWritten />);

    const label = screen.getByText('✦ WHY THIS PLAN · AI-WRITTEN');
    expect(label).toBeOnTheScreen();
    expect(label).toHaveProp('accessibilityLabel', 'Why this plan, AI-written');
    expect(StyleSheet.flatten(label.props.style).color).toBe(color.info);
  });

  test('the template fallback drops the AI wording', async () => {
    await render(<AIExplanation text={body} aiWritten={false} />);

    expect(screen.getByText('WHY THIS PLAN')).toBeOnTheScreen();
    expect(screen.queryByText(/AI-WRITTEN/)).toBeNull();
    expect(screen.getByText('WHY THIS PLAN')).toHaveProp('accessibilityLabel', 'Why this plan');
  });

  test('the body is the engine-worded text in the voice style, ink coloured', async () => {
    await render(<AIExplanation text={body} aiWritten />);

    expect(textStyle(body)).toMatchObject({ fontSize: 18, lineHeight: 26, color: color.ink });
  });

  test('has a 2px accent rule on the left and no radius', async () => {
    await render(<AIExplanation text={body} aiWritten />);

    expect(styleOf('ai-explanation')).toMatchObject({
      borderLeftWidth: 2,
      borderLeftColor: color.accent,
    });
    expect(styleOf('ai-explanation').borderRadius ?? 0).toBe(0);
  });
});

describe('ReasonRow', () => {
  test('lowers: a down arrow on an error tile, and the words "lowers your score"', async () => {
    await render(
      <ReasonRow title="Highest card at 81%" direction="lowers" caption="biggest drag" />,
    );

    expect(screen.getByText('↓', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(styleOf('reason-row-tile').backgroundColor).toBe(color.errorTint);
    expect(textStyle('↓').color).toBe(color.error);
    expect(screen.getByText('lowers your score · biggest drag')).toBeOnTheScreen();
  });

  test('improves: an up arrow on a success tile, and the words "improves your score"', async () => {
    await render(
      <ReasonRow title="36 months with zero missed" direction="improves" caption="steady" />,
    );

    expect(screen.getByText('↑', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(styleOf('reason-row-tile').backgroundColor).toBe(color.successTint);
    expect(textStyle('↑').color).toBe(color.success);
    expect(screen.getByText('improves your score · steady')).toBeOnTheScreen();
  });

  test('the direction words appear even when the caller passes no caption', async () => {
    await render(<ReasonRow title="Overall utilization 45%" direction="lowers" />);

    expect(screen.getByText('lowers your score')).toBeOnTheScreen();
  });

  test('one accessible row whose label carries title and direction in words', async () => {
    await render(
      <ReasonRow title="Highest card at 81%" direction="lowers" caption="biggest drag" />,
    );

    expect(screen.getByTestId('reason-row')).toHaveProp(
      'accessibilityLabel',
      'Highest card at 81%, lowers your score, biggest drag',
    );
  });

  test('the arrow tile is a 36 square and the row has a hairline border, no shadow', async () => {
    await render(<ReasonRow title="t" direction="lowers" caption="c" />);

    expect(styleOf('reason-row-tile')).toMatchObject({ width: 36, height: 36 });
    expect(styleOf('reason-row')).toMatchObject({
      borderColor: color.hairline,
      borderWidth: 1,
      backgroundColor: color.surface,
    });
    expect(styleOf('reason-row').boxShadow).toBeUndefined();
  });
});

describe('UtilizationLabel', () => {
  test('over the threshold: warning-coloured "⚠ OVER 30%"', async () => {
    await render(<UtilizationLabel percent={45} threshold={30} />);

    expect(textStyle('⚠ OVER 30%').color).toBe(color.warning);
  });

  test('at the threshold counts as on target, in ink', async () => {
    await render(<UtilizationLabel percent={30} threshold={30} />);

    expect(textStyle('✓ ON TARGET').color).toBe(color.ink);
    expect(screen.queryByText(/OVER/)).toBeNull();
  });

  test('just over the threshold is over', async () => {
    await render(<UtilizationLabel percent={30.1} threshold={30} />);

    expect(screen.getByText('⚠ OVER 30%')).toBeOnTheScreen();
  });

  test('uses the configured threshold, not a hard-coded 30', async () => {
    await render(<UtilizationLabel percent={25} threshold={20} />);

    expect(screen.getByText('⚠ OVER 20%')).toBeOnTheScreen();
  });

  test('the accessible label is words without the glyph', async () => {
    await render(<UtilizationLabel percent={45} threshold={30} />);
    expect(screen.getByText('⚠ OVER 30%')).toHaveProp('accessibilityLabel', 'Over 30%');

    await screen.rerender(<UtilizationLabel percent={10} threshold={30} />);
    expect(screen.getByText('✓ ON TARGET')).toHaveProp('accessibilityLabel', 'On target');
  });
});

describe('StatTile', () => {
  const props = {
    overline: 'UTILIZATION',
    value: '45.0%',
    barPercent: 45,
    targetPercent: 30,
    caption: 'across 3 cards',
    delta: '↓ 15.3% after plan',
    testID: 'tile',
  };

  test('has a hairline border and no shadow', async () => {
    await render(<StatTile {...props} />);

    expect(styleOf('tile')).toMatchObject({
      borderWidth: 1,
      borderColor: color.hairline,
      backgroundColor: color.surface,
      padding: 16,
    });
    expect(styleOf('tile').boxShadow).toBeUndefined();
  });

  test('the delta is its own Text, on its own line, in success', async () => {
    await render(<StatTile {...props} />);

    const value = screen.getByText('45.0%');
    const delta = screen.getByText('↓ 15.3% after plan');
    expect(delta).not.toBe(value);
    expect(StyleSheet.flatten(delta.props.style).color).toBe(color.success);
    expect(value.parent).toBe(delta.parent); // siblings in the column, not in a row with the value
    expect(StyleSheet.flatten(value.parent?.props.style).flexDirection).not.toBe('row');
  });

  test('no delta line when there is no delta', async () => {
    await render(<StatTile {...props} delta={undefined} />);

    expect(screen.queryByText(/after plan/)).toBeNull();
  });

  test('the value never wraps and is warning coloured only when over', async () => {
    await render(<StatTile {...props} over />);

    expect(screen.getByText('45.0%')).toHaveProp('numberOfLines', 1);
    expect(textStyle('45.0%').color).toBe(color.warning);

    await screen.rerender(<StatTile {...props} />);
    expect(textStyle('45.0%').color).toBe(color.ink);
  });

  test('the value stops growing early so a range fits a half-width tile at large font', async () => {
    await render(<StatTile {...props} value="708–736" />);

    expect(screen.getByText('708–736')).toHaveProp('maxFontSizeMultiplier', 1.1);
  });

  test('the bar fills to barPercent in warning when over, ink otherwise', async () => {
    await render(<StatTile {...props} over />);
    expect(styleOf('tile-bar-fill')).toMatchObject({
      width: '45%',
      backgroundColor: color.warning,
    });

    await screen.rerender(<StatTile {...props} />);
    expect(styleOf('tile-bar-fill').backgroundColor).toBe(color.ink);
  });

  test('a 2px ink tick sits at the target percent', async () => {
    await render(<StatTile {...props} />);

    expect(styleOf('tile-bar-target')).toMatchObject({
      width: 2,
      left: '30%',
      backgroundColor: color.ink,
    });
  });

  test('bar and tick percentages are clamped to 0..100', async () => {
    await render(<StatTile {...props} barPercent={140} targetPercent={-5} />);

    expect(styleOf('tile-bar-fill').width).toBe('100%');
    expect(styleOf('tile-bar-target').left).toBe('0%');
  });

  test('without onPress it is not a button', async () => {
    await render(<StatTile {...props} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  test('with onPress the whole tile is a 48dp button that reads value, caption and delta', async () => {
    const onPress = jest.fn();
    await render(<StatTile {...props} onPress={onPress} />);

    const button = screen.getByRole('button');
    expect(button).toHaveProp(
      'accessibilityLabel',
      'UTILIZATION, 45.0%, across 3 cards, ↓ 15.3% after plan',
    );
    expect(styleOf('tile').minHeight).toBeGreaterThanOrEqual(48);

    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
