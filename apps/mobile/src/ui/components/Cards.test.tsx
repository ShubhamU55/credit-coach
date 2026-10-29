import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Text } from '../primitives/Text';
import { cardFinish, color, shadow } from '../theme';
import { overlay } from '../theme/kitB';
import { ChipGlyph } from './ChipGlyph';
import { CardTile } from './CardTile';
import { HeroPaymentCard, type HeroPaymentCardProps } from './HeroPaymentCard';

const hidden = { includeHiddenElements: true } as const;

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style);
}

describe('ChipGlyph', () => {
  test('is decorative: hidden from screen readers and not accessible', async () => {
    await render(<ChipGlyph finish="plum" />);

    const glyph = screen.getByTestId('chip-glyph', hidden);
    expect(glyph).toHaveProp('accessible', false);
    expect(glyph).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(screen.queryByTestId('chip-glyph')).toBeNull();
  });

  test('is drawn in the finish colours, square', async () => {
    await render(<ChipGlyph finish="navy" />);

    expect(styleOf('chip-glyph')).toMatchObject({ borderColor: cardFinish.navy.muted });
    expect(styleOf('chip-glyph').borderRadius ?? 0).toBe(0);
  });
});

describe('CardTile', () => {
  const props = {
    name: 'HDFC Millennia',
    finish: 'graphite' as const,
    utilPercent: 81,
    threshold: 30,
    line: '₹81,000 / ₹1,00,000 · due 4 Nov',
    testID: 'tile',
  };

  test('shows the name and the line', async () => {
    await render(<CardTile {...props} />);

    expect(screen.getByText('HDFC Millennia')).toBeOnTheScreen();
    expect(screen.getByText(props.line)).toBeOnTheScreen();
  });

  test('above the threshold: warning label, warning number, warning bar', async () => {
    await render(<CardTile {...props} />);

    expect(screen.getByText('⚠ OVER 30%')).toBeOnTheScreen();
    const value = screen.getByText('81.0%');
    expect(StyleSheet.flatten(value.props.style).color).toBe(color.warning);
    expect(styleOf('tile-bar-fill').backgroundColor).toBe(color.warning);
  });

  test('at or below the threshold: on target label, ink number, ink bar, never red', async () => {
    await render(<CardTile {...props} utilPercent={30} />);

    expect(screen.getByText('✓ ON TARGET')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('30.0%').props.style).color).toBe(color.ink);
    expect(styleOf('tile-bar-fill').backgroundColor).toBe(color.ink);
    expect(screen.queryByText(/OVER/)).toBeNull();
  });

  test('the number is Number M, tabular and on one line', async () => {
    await render(<CardTile {...props} />);

    const value = screen.getByText('81.0%');
    expect(value).toHaveProp('numberOfLines', 1);
    expect(StyleSheet.flatten(value.props.style)).toMatchObject({
      fontSize: 30,
      fontVariant: ['tabular-nums'],
    });
  });

  test('the bar fill is the utilization as a width, clamped to 100%', async () => {
    await render(<CardTile {...props} />);
    expect(styleOf('tile-bar-fill').width).toBe('81%');

    await screen.rerender(<CardTile {...props} utilPercent={140} />);
    expect(styleOf('tile-bar-fill').width).toBe('100%');
  });

  test('the bar is 4 tall on the finish track', async () => {
    await render(<CardTile {...props} />);

    expect(styleOf('tile-bar-track')).toMatchObject({
      height: 4,
      backgroundColor: cardFinish.graphite.track,
    });
  });

  test('is 240 wide and at least 150 tall, with the finish fill, border and card-tile shadow', async () => {
    await render(<CardTile {...props} finish="navy" />);

    expect(styleOf('tile')).toMatchObject({
      width: 240,
      minHeight: 150,
      backgroundColor: cardFinish.navy.fill,
      borderColor: cardFinish.navy.border,
      boxShadow: shadow.cardTile,
    });
    expect(styleOf('tile').height).toBeUndefined();
    expect(styleOf('tile').borderRadius ?? 0).toBe(0);
  });

  test('the line is in the finish muted colour', async () => {
    await render(<CardTile {...props} finish="plum" />);

    expect(StyleSheet.flatten(screen.getByText(props.line).props.style).color).toBe(
      cardFinish.plum.muted,
    );
  });

  test('without onPress it is not a button', async () => {
    await render(<CardTile {...props} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  test('with onPress it is one button whose label reads name, utilization, status and line', async () => {
    const onPress = jest.fn();
    await render(<CardTile {...props} onPress={onPress} />);

    const button = screen.getByRole('button');
    expect(button).toHaveProp(
      'accessibilityLabel',
      'HDFC Millennia, 81.0%, over 30%, ₹81,000 / ₹1,00,000 · due 4 Nov',
    );
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('the pressed tile drops its shadow and translates by 4', async () => {
    await render(<CardTile {...props} onPress={() => {}} />);

    await fireEvent(screen.getByRole('button'), 'pressIn');

    expect(styleOf('tile')).toMatchObject({
      boxShadow: 'none',
      transform: [{ translateX: 4 }, { translateY: 4 }],
    });
  });

  test('keeps a right margin equal to the shadow offset', async () => {
    await render(<CardTile {...props} />);

    expect(styleOf('tile').marginRight).toBe(4);
  });
});

describe('HeroPaymentCard', () => {
  const props: HeroPaymentCardProps = {
    finish: 'plum',
    cardName: 'Axis Neo',
    dueChip: 'BY THU, 22 OCT',
    amount: '₹12,400',
    sentence: 'By Thu, 22 Oct — clears your full statement, so zero interest.',
    minimumLine: '₹620 of it is your minimum.',
    stepsDone: 2,
    stepsTotal: 5,
    onMarkPaid: () => {},
    onViewPlan: () => {},
  };

  test('renders the overline, card name, amount and due chip', async () => {
    await render(<HeroPaymentCard {...props} />);

    expect(screen.getByText('NEXT PAYMENT')).toBeOnTheScreen();
    expect(screen.getByText('Axis Neo')).toBeOnTheScreen();
    expect(screen.getByText('₹12,400')).toBeOnTheScreen();
    expect(screen.getByText('BY THU, 22 OCT')).toBeOnTheScreen();
  });

  test('the due chip is the on-finish chip with a dot', async () => {
    await render(<HeroPaymentCard {...props} />);

    expect(styleOf('hero-chip').backgroundColor).toBe(overlay.onFinishChip);
    expect(screen.getByTestId('hero-chip-dot', hidden)).toBeOnTheScreen();
  });

  test('the amount is Number L, on one line, and fits by shrinking rather than truncating digits', async () => {
    await render(<HeroPaymentCard {...props} amount="₹1,00,000" />);

    const amount = screen.getByText('₹1,00,000');
    expect(amount).toHaveProp('numberOfLines', 1);
    expect(amount).toHaveProp('adjustsFontSizeToFit', true);
    expect(StyleSheet.flatten(amount.props.style)).toMatchObject({
      fontSize: 56,
      fontVariant: ['tabular-nums'],
    });
  });

  test('shows the sentence, including rich nodes, and the minimum line (never hidden)', async () => {
    await render(
      <HeroPaymentCard
        {...props}
        sentence={
          <>
            By <Text variant="bodyS">Thu, 22 Oct</Text> — zero interest.
          </>
        }
      />,
    );

    expect(screen.getByText('Thu, 22 Oct')).toBeOnTheScreen();
    expect(screen.getByText('₹620 of it is your minimum.')).toBeOnTheScreen();
  });

  test('draws one segment per step, the first stepsDone in accent', async () => {
    await render(<HeroPaymentCard {...props} stepsDone={2} stepsTotal={5} />);

    const segments = [0, 1, 2, 3, 4].map((i) => styleOf(`hero-segment-${i}`).backgroundColor);
    expect(segments).toEqual([
      color.accent,
      color.accent,
      overlay.heroSegmentEmpty,
      overlay.heroSegmentEmpty,
      overlay.heroSegmentEmpty,
    ]);
    expect(screen.queryByTestId('hero-segment-5', hidden)).toBeNull();
  });

  test('the plan line says the progress in words', async () => {
    await render(<HeroPaymentCard {...props} stepsDone={2} stepsTotal={5} />);

    expect(screen.getByText("THIS MONTH'S PLAN · 2 of 5 done")).toBeOnTheScreen();
  });

  test('stepsDone is clamped to 0..stepsTotal', async () => {
    await render(<HeroPaymentCard {...props} stepsDone={9} stepsTotal={3} />);

    expect(screen.getByText("THIS MONTH'S PLAN · 3 of 3 done")).toBeOnTheScreen();
    expect(
      [0, 1, 2].every((i) => styleOf(`hero-segment-${i}`).backgroundColor === color.accent),
    ).toBe(true);
  });

  test('the card has the finish fill and border, the hero shadow and square corners', async () => {
    await render(<HeroPaymentCard {...props} />);

    expect(styleOf('hero-card')).toMatchObject({
      backgroundColor: cardFinish.plum.fill,
      borderColor: cardFinish.plum.border,
      boxShadow: shadow.hero,
    });
    expect(styleOf('hero-card').borderRadius ?? 0).toBe(0);
    expect(styleOf('hero-card').marginRight).toBe(6);
  });

  test('the divider is dashed in the finish border colour', async () => {
    await render(<HeroPaymentCard {...props} />);

    expect(styleOf('hero-divider-line')).toMatchObject({
      borderStyle: 'dashed',
      borderColor: cardFinish.plum.border,
    });
  });

  test('the primary button is "Mark as paid", on the hero shadow, and fires onMarkPaid', async () => {
    const onMarkPaid = jest.fn();
    await render(<HeroPaymentCard {...props} onMarkPaid={onMarkPaid} />);

    const button = screen.getByRole('button', { name: 'Mark as paid' });
    expect(StyleSheet.flatten(button.props.style).boxShadow).toBe(shadow.popOnHero);
    await fireEvent.press(button);
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
  });

  test('View full plan is a link on the finish (ink) and fires onViewPlan', async () => {
    const onViewPlan = jest.fn();
    await render(<HeroPaymentCard {...props} onViewPlan={onViewPlan} />);

    const link = screen.getByRole('link', { name: 'View full plan →' });
    await fireEvent.press(link);
    expect(onViewPlan).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByText('VIEW FULL PLAN →').props.style).color).toBe(
      color.ink,
    );
  });

  test('has exactly one filled primary button', async () => {
    await render(<HeroPaymentCard {...props} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
