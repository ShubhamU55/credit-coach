import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color } from '../theme';
import { kitShadow } from '../theme/kitB';
import { PaymentTimelineStrip } from './PaymentTimelineStrip';

function styleOf(testID: string) {
  // Decorative parts are hidden from screen readers on purpose.
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

describe('PaymentTimelineStrip', () => {
  const lanes = [
    {
      cardName: 'Axis Neo',
      payBy: { iso: '2026-10-22', label: '₹12,400 · 22 Oct' },
      due: '2026-10-22',
      statement: '2026-11-02',
    },
    {
      cardName: 'SBI SimplyClick',
      payBy: { iso: '2026-10-24', label: '₹2,400 · 24 Oct' },
      statement: '2026-10-25',
    },
  ];
  const props = { todayIso: '2026-10-21', lanes, a11yLabel: 'Pay Axis Neo ₹12,400 by 22 Oct.' };

  function markers(testID: string) {
    return screen.queryAllByTestId(testID, { includeHiddenElements: true });
  }

  test('the whole strip is one image with the given sentence label', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    const strip = screen.getByRole('image');
    expect(strip).toHaveProp('accessibilityLabel', 'Pay Axis Neo ₹12,400 by 22 Oct.');
    expect(screen.getAllByRole('image')).toHaveLength(1);
  });

  test('the label is dynamic: a new a11yLabel replaces the old one', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    await screen.rerender(<PaymentTimelineStrip {...props} a11yLabel="With the 10% switch on." />);

    expect(screen.getByRole('image')).toHaveProp('accessibilityLabel', 'With the 10% switch on.');
  });

  test('a lane without a due date draws no Due marker (the SBI case)', async () => {
    await render(<PaymentTimelineStrip {...props} lanes={[lanes[1]]} />);

    expect(markers('due-marker')).toHaveLength(0);
    expect(markers('pay-marker')).toHaveLength(1);
  });

  test('a lane with a due date draws exactly one Due marker', async () => {
    await render(<PaymentTimelineStrip {...props} lanes={[lanes[0]]} />);

    expect(markers('due-marker')).toHaveLength(1);
  });

  test('across lanes, only the lane that has a due date has a marker', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    expect(markers('due-marker')).toHaveLength(1);
    expect(
      within(
        screen.getByTestId('timeline-lane-0', { includeHiddenElements: true }),
      ).queryAllByTestId('due-marker', { includeHiddenElements: true }),
    ).toHaveLength(1);
    expect(
      within(
        screen.getByTestId('timeline-lane-1', { includeHiddenElements: true }),
      ).queryAllByTestId('due-marker', { includeHiddenElements: true }),
    ).toHaveLength(0);
  });

  test('a lane with no dates draws no markers at all', async () => {
    await render(<PaymentTimelineStrip {...props} lanes={[{ cardName: 'X' }]} />);

    expect(markers('pay-marker')).toHaveLength(0);
    expect(markers('due-marker')).toHaveLength(0);
    expect(markers('statement-marker')).toHaveLength(0);
  });

  test('markers are positioned by day offset over the 30-day window', async () => {
    await render(
      <PaymentTimelineStrip
        {...props}
        lanes={[
          {
            cardName: 'Axis Neo',
            payBy: { iso: '2026-10-21', label: 'today' },
            due: '2026-11-05',
            statement: '2026-11-20',
          },
        ]}
      />,
    );

    expect(styleOf('pay-marker').left).toBe('0%');
    expect(styleOf('due-marker').left).toBe('50%');
    expect(styleOf('statement-marker').left).toBe('100%'); // day 30 is the last day of the window
  });

  test('a date 31 days out or in the past is not drawn', async () => {
    await render(
      <PaymentTimelineStrip
        {...props}
        lanes={[
          {
            cardName: 'Axis Neo',
            payBy: { iso: '2026-10-20', label: 'yesterday' },
            due: '2026-11-21',
            statement: 'not-a-date',
          },
        ]}
      />,
    );

    expect(markers('pay-marker')).toHaveLength(0);
    expect(markers('due-marker')).toHaveLength(0);
    expect(markers('statement-marker')).toHaveLength(0);
  });

  test('the pay marker is a square accent block with the 2px offset shadow', async () => {
    await render(<PaymentTimelineStrip {...props} lanes={[lanes[0]]} />);

    expect(styleOf('pay-marker')).toMatchObject({
      backgroundColor: color.accent,
      boxShadow: kitShadow.timelinePay,
    });
    expect(styleOf('pay-marker').borderRadius ?? 0).toBe(0);
  });

  test('the due marker is an ink circle and the statement marker an outlined rotated square', async () => {
    await render(<PaymentTimelineStrip {...props} lanes={[lanes[0]]} />);

    expect(styleOf('due-marker')).toMatchObject({
      backgroundColor: color.ink,
      borderRadius: styleOf('due-marker').width / 2,
    });
    const statement = styleOf('statement-marker');
    expect(statement).toMatchObject({ borderColor: color.ink, borderWidth: 1 });
    expect(statement.transform).toEqual([{ rotate: '45deg' }]);
    expect(statement.borderRadius ?? 0).toBe(0);
  });

  test('shows the pay label in link and a legend with words for every marker', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    expect(StyleSheet.flatten(screen.getByText('₹12,400 · 22 Oct').props.style).color).toBe(
      color.link,
    );
    expect(screen.getByText('You pay', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Due', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(
      screen.getByText('Statement (reported)', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  test('draws an accent line for today', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    expect(styleOf('timeline-today')).toMatchObject({ width: 1, backgroundColor: color.accent });
  });

  test('card names label each lane', async () => {
    await render(<PaymentTimelineStrip {...props} />);

    expect(screen.getByText('Axis Neo')).toBeOnTheScreen();
    expect(screen.getByText('SBI SimplyClick')).toBeOnTheScreen();
  });
});
