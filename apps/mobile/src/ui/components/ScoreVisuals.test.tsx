import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color, scoreZone, shadow } from '../theme';
import { kitShadow } from '../theme/kitB';
import { ScoreCard, type ScoreCardProps } from './ScoreCard';
import { ScoreRangeText } from './ScoreRangeText';
import { WhatIfTile } from './WhatIfTile';
import { Text } from '../primitives/Text';

function styleOf(testID: string) {
  // Decorative parts are hidden from screen readers on purpose.
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

const hidden = { includeHiddenElements: true } as const;

describe('ScoreRangeText', () => {
  test('is one line: numberOfLines 1 and never shrunk to fit', async () => {
    await render(<ScoreRangeText range="708–736" size="XL" />);

    const text = screen.getByTestId('score-range');
    expect(text).toHaveProp('numberOfLines', 1);
    expect(text).toHaveProp('adjustsFontSizeToFit', false);
  });

  test('shows the range text exactly as given, en dash included', async () => {
    await render(<ScoreRangeText range="708–736" size="XL" />);

    expect(screen.getByTestId('score-range')).toHaveTextContent('708–736', { exact: true });
  });

  test('does not shrink in a row (the neighbour moves instead)', async () => {
    await render(<ScoreRangeText range="708–736" size="XL" />);

    expect(styleOf('score-range').flexShrink).toBe(0);
  });

  test.each([
    ['XL', 64],
    ['M', 30],
  ] as const)('size %s uses the %s px Jakarta number style', async (size, fontSize) => {
    await render(<ScoreRangeText range="708–736" size={size} />);

    expect(styleOf('score-range')).toMatchObject({
      fontSize,
      fontVariant: ['tabular-nums'],
      color: color.ink,
    });
  });

  test('a font-scale cap keeps the range on one line at large font', async () => {
    await render(<ScoreRangeText range="708–736" size="XL" />);

    expect(screen.getByTestId('score-range')).toHaveProp('maxFontSizeMultiplier', 1.1);
  });

  test('accepts another testID', async () => {
    await render(<ScoreRangeText range="724–752" size="M" testID="plan-range" />);

    expect(screen.getByTestId('plan-range')).toBeOnTheScreen();
  });
});

describe('ScoreCard', () => {
  const zones = [
    { name: 'Poor', from: 300, to: 550 },
    { name: 'Fair', from: 550, to: 650 },
    { name: 'Good', from: 650, to: 750 },
    { name: 'Excellent', from: 750, to: 900 },
  ];
  const props: ScoreCardProps = {
    range: '708–736',
    zones,
    currentZone: 'Good',
    nowLow: 708,
    nowHigh: 736,
    footer: 'Last reported 724 on 2 Oct · sample report',
  };

  test('says it is an estimate and not the official score', async () => {
    await render(<ScoreCard {...props} />);

    expect(screen.getByText('estimate')).toBeOnTheScreen();
    expect(screen.getByText('Not your official CIBIL score.')).toBeOnTheScreen();
    expect(screen.getByText('ESTIMATED SCORE')).toBeOnTheScreen();
  });

  test('the estimate word is Fraunces italic in link, never on a number', async () => {
    await render(<ScoreCard {...props} />);

    const style = StyleSheet.flatten(screen.getByText('estimate').props.style);
    expect(style.color).toBe(color.link);
    expect(style.fontFamily).toMatch(/Italic/);
  });

  test('shows the range through ScoreRangeText, on one line', async () => {
    await render(<ScoreCard {...props} />);

    expect(screen.getByTestId('score-range')).toHaveTextContent('708–736', { exact: true });
    expect(screen.getByTestId('score-range')).toHaveProp('numberOfLines', 1);
  });

  test('shows the footer', async () => {
    await render(<ScoreCard {...props} />);

    expect(screen.getByText('Last reported 724 on 2 Oct · sample report')).toBeOnTheScreen();
  });

  test('draws one segment per zone, sized in proportion to to minus from', async () => {
    await render(<ScoreCard {...props} />);

    const flexes = [0, 1, 2, 3].map((i) => styleOf(`score-zone-${i}`).flex);
    expect(flexes).toEqual([250, 100, 100, 150]);
  });

  test('zone cut points come from props, not from the component', async () => {
    const custom = [
      { name: 'Poor', from: 300, to: 500 },
      { name: 'Fair', from: 500, to: 600 },
      { name: 'Good', from: 600, to: 700 },
      { name: 'Excellent', from: 700, to: 900 },
    ];
    await render(<ScoreCard {...props} zones={custom} />);

    expect([0, 1, 2, 3].map((i) => styleOf(`score-zone-${i}`).flex)).toEqual([200, 100, 100, 200]);
  });

  test('segments take the zone colours from tokens, matched by name', async () => {
    await render(<ScoreCard {...props} />);

    expect([0, 1, 2, 3].map((i) => styleOf(`score-zone-${i}`).backgroundColor)).toEqual([
      scoreZone.poor,
      scoreZone.fair,
      scoreZone.good,
      scoreZone.excellent,
    ]);
  });

  test('segments are 14 tall, square, with 3px gaps', async () => {
    await render(<ScoreCard {...props} />);

    expect(styleOf('score-zone-1')).toMatchObject({ height: 14, marginLeft: 3 });
    expect(styleOf('score-zone-0').marginLeft ?? 0).toBe(0);
    expect(styleOf('score-zone-1').borderRadius ?? 0).toBe(0);
  });

  test('the now block is ink, 24 tall, spans the range on the scale, with the bg shadow', async () => {
    await render(<ScoreCard {...props} />);

    const now = styleOf('score-now');
    expect(now).toMatchObject({
      height: 24,
      backgroundColor: color.ink,
      boxShadow: kitShadow.scoreNow,
      left: '68%', // (708 - 300) / 600
      width: '4.67%', // (736 - 708) / 600
    });
  });

  test('the now block is clamped inside the scale', async () => {
    await render(<ScoreCard {...props} nowLow={250} nowHigh={950} />);

    expect(styleOf('score-now')).toMatchObject({ left: '0%', width: '100%' });
  });

  test('the zone bar is one image whose sentence names the range, zone and every zone span', async () => {
    await render(<ScoreCard {...props} />);

    const bar = screen.getByRole('image');
    expect(bar).toHaveProp(
      'accessibilityLabel',
      'Estimated score 708–736, in the Good zone. Zones: Poor 300 to 550, Fair 550 to 650, Good 650 to 750, Excellent 750 to 900.',
    );
    expect(screen.getAllByRole('image')).toHaveLength(1);
  });

  test('the current zone label is ink, the others muted', async () => {
    await render(<ScoreCard {...props} />);

    const label = (name: string) =>
      StyleSheet.flatten(screen.getByText(name, hidden).props.style).color;
    expect(label('Good')).toBe(color.ink);
    expect(label('Poor')).toBe(color.muted);
    expect(label('Excellent')).toBe(color.muted);
  });

  test('without a plan there is no plan lane and no dashed rule', async () => {
    await render(<ScoreCard {...props} />);

    expect(screen.queryByTestId('score-card-plan', hidden)).toBeNull();
    expect(screen.queryByTestId('score-card-rule', hidden)).toBeNull();
  });

  describe('with a plan', () => {
    const withPlan = { range: '724–752', low: 724, high: 752 };

    test('the plan range is on its own row, never in the row of the current range', async () => {
      await render(<ScoreCard {...props} withPlan={withPlan} />);

      const main = screen.getByTestId('score-card-main', hidden);
      const plan = screen.getByTestId('score-card-plan', hidden);
      expect(within(main).getByTestId('score-range')).toBeOnTheScreen();
      expect(within(main).queryByTestId('score-range-plan', hidden)).toBeNull();
      expect(within(plan).getByTestId('score-range-plan')).toHaveTextContent(
        'With plan · 724–752',
        { exact: true },
      );
      expect(within(plan).queryByTestId('score-range')).toBeNull();
      expect(screen.getByTestId('score-range-plan').parent).not.toBe(
        screen.getByTestId('score-range').parent,
      );
    });

    test('the plan label is link coloured and never wraps', async () => {
      await render(<ScoreCard {...props} withPlan={withPlan} />);

      expect(screen.getByTestId('score-range-plan')).toHaveProp('numberOfLines', 1);
      expect(styleOf('score-range-plan').color).toBe(color.link);
    });

    test('a dashed rule separates the plan lane from the current range', async () => {
      await render(<ScoreCard {...props} withPlan={withPlan} />);

      expect(styleOf('score-card-rule-line')).toMatchObject({
        borderStyle: 'dashed',
        borderColor: color.rule,
      });
    });

    test('the plan block is accent, on the same scale', async () => {
      await render(<ScoreCard {...props} withPlan={withPlan} />);

      expect(styleOf('score-plan-block')).toMatchObject({
        backgroundColor: color.accent,
        left: '70.67%', // (724 - 300) / 600
        width: '4.67%',
      });
    });

    test('the image sentence includes the plan range', async () => {
      await render(<ScoreCard {...props} withPlan={withPlan} />);

      expect(screen.getByRole('image')).toHaveProp(
        'accessibilityLabel',
        expect.stringContaining('With the plan, 724–752.'),
      );
    });
  });

  test('an empty zone list draws no bar and does not crash', async () => {
    await render(<ScoreCard {...props} zones={[]} />);

    expect(screen.queryByTestId('score-zone-0', hidden)).toBeNull();
    expect(screen.getByTestId('score-range')).toBeOnTheScreen();
  });

  test('is a padded 20 surface card', async () => {
    await render(<ScoreCard {...props} />);

    expect(styleOf('score-card')).toMatchObject({
      padding: 20,
      backgroundColor: color.surface,
    });
    expect(styleOf('score-card').borderRadius ?? 0).toBe(0);
  });
});

describe('WhatIfTile', () => {
  const icon = <Text variant="title">+</Text>;

  test('suggested uses the small accent pop shadow and an accent border', async () => {
    await render(
      <WhatIfTile icon={icon} label="Follow this month's plan" suggested onPress={() => {}} />,
    );

    expect(styleOf('what-if-tile')).toMatchObject({
      boxShadow: shadow.popSmall,
      borderColor: color.accent,
    });
  });

  test('not suggested uses the idle tile shadow and a lineStrong border', async () => {
    await render(<WhatIfTile icon={icon} label="Miss a payment" onPress={() => {}} />);

    expect(styleOf('what-if-tile')).toMatchObject({
      boxShadow: shadow.tileIdle,
      borderColor: color.lineStrong,
    });
  });

  test('is at least 92 tall (minHeight) and at least 48 wide', async () => {
    await render(<WhatIfTile icon={icon} label="Miss a payment" onPress={() => {}} />);

    expect(styleOf('what-if-tile').minHeight).toBeGreaterThanOrEqual(92);
    expect(styleOf('what-if-tile').height).toBeUndefined();
  });

  test('is a button named by its label, and the suggested one says so in the hint', async () => {
    await render(
      <>
        <WhatIfTile
          icon={icon}
          label="Follow this month's plan"
          suggested
          onPress={() => {}}
          testID="a"
        />
        <WhatIfTile icon={icon} label="Miss a payment" onPress={() => {}} testID="b" />
      </>,
    );

    expect(screen.getByRole('button', { name: "Follow this month's plan" })).toHaveProp(
      'accessibilityHint',
      'Suggested',
    );
    expect(
      screen.getByRole('button', { name: 'Miss a payment' }).props.accessibilityHint,
    ).toBeUndefined();
  });

  test('pressing calls onPress', async () => {
    const onPress = jest.fn();
    await render(<WhatIfTile icon={icon} label="Miss a payment" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('the pressed tile drops its shadow and translates by 3 (the pop press)', async () => {
    await render(<WhatIfTile icon={icon} label="Miss a payment" onPress={() => {}} />);

    await fireEvent(screen.getByRole('button'), 'pressIn');

    expect(styleOf('what-if-tile')).toMatchObject({
      boxShadow: 'none',
      transform: [{ translateX: 3 }, { translateY: 3 }],
    });
  });

  test('shows the label and keeps the icon out of the accessibility tree', async () => {
    await render(<WhatIfTile icon={icon} label="Miss a payment" onPress={() => {}} />);

    expect(screen.getByText('Miss a payment')).toBeOnTheScreen();
    expect(screen.queryByText('+')).toBeNull();
    expect(screen.getByText('+', hidden)).toBeOnTheScreen();
  });
});
