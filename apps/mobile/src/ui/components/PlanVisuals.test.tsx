import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color } from '../theme';
import { kitShadow } from '../theme/kitB';
import { BeforeAfterBar } from './BeforeAfterBar';
import { DateBlockTimeline } from './DateBlockTimeline';
import { PlanStepCard, type PlanStepCardProps } from './PlanStepCard';

function styleOf(testID: string) {
  // Decorative parts are hidden from screen readers on purpose.
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

describe('BeforeAfterBar', () => {
  const props = { beforePercent: 19.5, afterPercent: 18.7, label: '19.5% → 18.7%', testID: 'bar' };

  test('is one image whose label carries both numbers', async () => {
    await render(<BeforeAfterBar {...props} />);

    const bar = screen.getByRole('image');
    expect(bar).toHaveProp('accessibilityLabel', 'Utilization 19.5% → 18.7%');
  });

  test('shows the label text beside the bar and never wraps it', async () => {
    await render(<BeforeAfterBar {...props} />);

    expect(screen.getByText('19.5% → 18.7%')).toHaveProp('numberOfLines', 1);
  });

  test('the accent fill is the "after" width', async () => {
    await render(<BeforeAfterBar {...props} />);

    expect(styleOf('bar-fill')).toMatchObject({ width: '18.7%', backgroundColor: color.accent });
  });

  test('the removed part starts where the fill ends and is not a solid colour', async () => {
    await render(<BeforeAfterBar {...props} />);

    const removed = styleOf('bar-removed');
    expect(removed).toMatchObject({ left: '18.7%', width: '0.8%', overflow: 'hidden' });
    expect(removed.backgroundColor).toBeUndefined();
  });

  test('the removed part is hatched with 2px muted stripes once measured, 2px gaps apart', async () => {
    await render(<BeforeAfterBar {...props} beforePercent={80} afterPercent={10} />);
    expect(screen.queryAllByTestId('bar-stripe', { includeHiddenElements: true })).toHaveLength(0);

    await fireEvent(screen.getByTestId('bar-removed', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 80, height: 10 } },
    });

    const stripes = screen.getAllByTestId('bar-stripe', { includeHiddenElements: true });
    expect(stripes.length).toBeGreaterThan(20);
    const first = StyleSheet.flatten(stripes[0].props.style);
    const second = StyleSheet.flatten(stripes[1].props.style);
    expect(first).toMatchObject({ width: 2, backgroundColor: color.muted });
    expect(first.transform).toEqual([{ rotate: '45deg' }]);
    expect(second.left - first.left).toBe(4); // 2px stripe + 2px gap
  });

  test('no removed part when the plan does not lower the value', async () => {
    await render(<BeforeAfterBar {...props} beforePercent={18.7} />);

    expect(styleOf('bar-removed').width).toBe('0%');
  });

  test('clamps out-of-range percentages', async () => {
    await render(<BeforeAfterBar {...props} beforePercent={140} afterPercent={-3} />);

    expect(styleOf('bar-fill').width).toBe('0%');
    expect(styleOf('bar-removed')).toMatchObject({ left: '0%', width: '100%' });
  });

  test('is square', async () => {
    await render(<BeforeAfterBar {...props} />);

    expect(styleOf('bar-track').borderRadius ?? 0).toBe(0);
  });
});

describe('PlanStepCard', () => {
  const base: PlanStepCardProps = {
    index: 0,
    kind: 'PAY THE MINIMUM',
    cardName: 'Axis Neo',
    amount: '₹620',
    payBy: { label: 'BY THU, 22 OCT', soon: false },
    reason: 'Pay before the statement is reported.',
    beforePercent: 19.5,
    afterPercent: 18.7,
    barLabel: '19.5% → 18.7%',
    state: 'secondary',
    onMarkPaid: () => {},
    onUndo: () => {},
  };

  test('testID follows the plan-step-<index> convention', async () => {
    await render(<PlanStepCard {...base} index={3} />);

    expect(screen.getByTestId('plan-step-3')).toBeOnTheScreen();
  });

  test('shows the step number outside the card, two digits, one-based', async () => {
    await render(<PlanStepCard {...base} index={0} />);

    expect(screen.getByText('01')).toBeOnTheScreen();
  });

  test('shows kind, card name, amount, pay-by chip, reason and the before/after bar', async () => {
    await render(<PlanStepCard {...base} />);

    expect(screen.getByText('PAY THE MINIMUM')).toBeOnTheScreen();
    expect(screen.getByText('Axis Neo')).toBeOnTheScreen();
    expect(screen.getByText('₹620')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText('BY THU, 22 OCT')).toBeOnTheScreen();
    expect(screen.getByText('Pay before the statement is reported.')).toBeOnTheScreen();
    expect(screen.getByRole('image')).toHaveProp('accessibilityLabel', 'Utilization 19.5% → 18.7%');
  });

  test('primary: accent border, the accentEdge step shadow and a pop Mark as paid button', async () => {
    const onMarkPaid = jest.fn();
    await render(<PlanStepCard {...base} state="primary" onMarkPaid={onMarkPaid} />);

    expect(styleOf('plan-step-0-card')).toMatchObject({
      borderColor: color.accent,
      boxShadow: kitShadow.stepPrimary,
    });
    const button = screen.getByRole('button', { name: 'Mark Axis Neo ₹620 as paid' });
    expect(button).toHaveProp('testID', 'plan-step-0-mark-paid');
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(color.accent);

    await fireEvent.press(button);
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
  });

  test('primary: the step number is in the link colour', async () => {
    await render(<PlanStepCard {...base} state="primary" />);

    expect(StyleSheet.flatten(screen.getByText('01').props.style).color).toBe(color.link);
  });

  test('secondary: hairline border, no shadow and an outline Mark as paid button', async () => {
    await render(<PlanStepCard {...base} state="secondary" />);

    expect(styleOf('plan-step-0-card')).toMatchObject({
      borderColor: color.hairline,
      borderWidth: 1,
    });
    expect(styleOf('plan-step-0-card').boxShadow).toBeUndefined();
    const button = screen.getByRole('button', { name: 'Mark Axis Neo ₹620 as paid' });
    const style = StyleSheet.flatten(button.props.style);
    expect(style.borderColor).toBe(color.line);
    expect(style.boxShadow).toBeUndefined();
  });

  test('paid: no Mark as paid button, a struck-through summary, the PAID line and Undo', async () => {
    const onUndo = jest.fn();
    await render(<PlanStepCard {...base} state="paid" paidLabel="21 OCT" onUndo={onUndo} />);

    expect(screen.queryByRole('button', { name: 'Mark Axis Neo ₹620 as paid' })).toBeNull();
    expect(screen.getByText('✓ PAID · 21 OCT')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('✓ PAID · 21 OCT').props.style).color).toBe(
      color.success,
    );
    const summary = screen.getByText('Axis Neo · ₹620');
    expect(StyleSheet.flatten(summary.props.style)).toMatchObject({
      textDecorationLine: 'line-through',
      color: color.muted,
    });
    expect(summary).toHaveProp('accessibilityLabel', 'Axis Neo, ₹620, paid');

    await fireEvent.press(screen.getByRole('button', { name: 'Undo Axis Neo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('paid: collapses, so the bar and reason are gone, but the step stays in the list', async () => {
    await render(<PlanStepCard {...base} state="paid" paidLabel="21 OCT" />);

    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.queryByText(base.reason)).toBeNull();
    expect(screen.getByTestId('plan-step-0')).toBeOnTheScreen();
  });

  test('only the paid state offers Undo', async () => {
    await render(<PlanStepCard {...base} state="primary" />);

    expect(screen.queryByRole('button', { name: 'Undo Axis Neo' })).toBeNull();
  });

  test('a soon pay-by date gets the warning glyph in a due-soon chip', async () => {
    await render(<PlanStepCard {...base} payBy={{ label: 'BY TOMORROW', soon: true }} />);

    expect(screen.getByText('⚠ BY TOMORROW')).toBeOnTheScreen();
    expect(styleOf('plan-step-0-chip').backgroundColor).toBe(color.warningTint);
  });

  test('a later pay-by date has no glyph and a neutral chip', async () => {
    await render(<PlanStepCard {...base} />);

    expect(screen.queryByText(/⚠/)).toBeNull();
    expect(styleOf('plan-step-0-chip').backgroundColor).toBe(color.surface2);
  });

  test.each(['primary', 'secondary', 'paid'] as const)(
    'never uses a checkbox (%s)',
    async (state) => {
      await render(<PlanStepCard {...base} state={state} paidLabel="21 OCT" />);

      expect(screen.queryByRole('checkbox')).toBeNull();
    },
  );
});

describe('DateBlockTimeline', () => {
  const items = [
    {
      day: 'Thu',
      date: '22',
      month: 'Oct',
      title: 'Axis Neo',
      reason: "Pay before it's reported · 19.5% → 18.7%",
      amount: '₹12,400',
    },
    {
      day: 'Wed',
      date: '4',
      month: 'Nov',
      title: 'HDFC Millennia',
      reason: 'Due date',
      amount: '₹74,200',
    },
  ];

  test('every row is a button that reports its index', async () => {
    const onPressItem = jest.fn();
    await render(<DateBlockTimeline items={items} onPressItem={onPressItem} />);

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    await fireEvent.press(rows[1]);
    expect(onPressItem).toHaveBeenCalledWith(1);
  });

  test('the row label reads date, title, reason and amount', async () => {
    await render(<DateBlockTimeline items={items} onPressItem={() => {}} />);

    expect(screen.getByTestId('date-block-row-0')).toHaveProp(
      'accessibilityLabel',
      "Thu 22 Oct, Axis Neo, Pay before it's reported · 19.5% → 18.7%, ₹12,400",
    );
  });

  test('the date block is 48 wide, at least 58 tall, surface2 with a hairline border', async () => {
    await render(<DateBlockTimeline items={items} onPressItem={() => {}} />);

    expect(styleOf('date-block-0')).toMatchObject({
      width: 48,
      minHeight: 58,
      backgroundColor: color.surface2,
      borderColor: color.hairline,
      borderWidth: 1,
    });
    expect(styleOf('date-block-0').height).toBeUndefined();
    expect(styleOf('date-block-0').borderRadius ?? 0).toBe(0);
  });

  test('the row is a whole-row 48dp target', async () => {
    await render(<DateBlockTimeline items={items} onPressItem={() => {}} />);

    expect(styleOf('date-block-row-0').minHeight).toBeGreaterThanOrEqual(48);
  });

  test('draws a 1px rule connector between blocks only', async () => {
    await render(<DateBlockTimeline items={items} onPressItem={() => {}} />);

    expect(
      screen.getAllByTestId('date-block-connector', { includeHiddenElements: true }),
    ).toHaveLength(1);
    expect(styleOf('date-block-connector')).toMatchObject({
      width: 1,
      backgroundColor: color.rule,
    });
  });

  test('amounts never wrap', async () => {
    await render(<DateBlockTimeline items={items} onPressItem={() => {}} />);

    expect(screen.getByText('₹12,400')).toHaveProp('numberOfLines', 1);
  });

  test('renders nothing pressable for an empty list', async () => {
    await render(<DateBlockTimeline items={[]} onPressItem={() => {}} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
