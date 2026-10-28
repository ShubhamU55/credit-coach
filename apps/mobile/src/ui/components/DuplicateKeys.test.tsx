import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { DateBlockTimeline } from './DateBlockTimeline';
import { PaymentTimelineStrip } from './PaymentTimelineStrip';
import { ScoreCard } from './ScoreCard';

const hidden = { includeHiddenElements: true } as const;

describe('duplicate names and dates never collide on a React key', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());
  const noKeyWarning = () => expect(error.mock.calls.flat().join(' ')).not.toMatch(/key/i);

  test('two timeline lanes with the same card name', async () => {
    await render(
      <PaymentTimelineStrip
        todayIso="2026-10-21"
        a11yLabel="x"
        lanes={[
          { cardName: 'Axis Neo', payBy: { iso: '2026-10-22', label: 'a' } },
          { cardName: 'Axis Neo', payBy: { iso: '2026-10-23', label: 'b' } },
        ]}
      />,
    );

    expect(screen.getAllByText('Axis Neo')).toHaveLength(2);
    expect(screen.getAllByTestId('pay-marker', hidden)).toHaveLength(2);
    noKeyWarning();
  });

  test('two date rows with the same date and title', async () => {
    const row = {
      day: 'Thu',
      date: '22',
      month: 'Oct',
      title: 'Axis Neo',
      reason: 'r',
      amount: '₹1',
    };
    await render(<DateBlockTimeline items={[row, { ...row }]} onPressItem={() => {}} />);

    expect(screen.getAllByText('Axis Neo')).toHaveLength(2);
    expect(screen.getByTestId('date-block-row-1')).toBeOnTheScreen();
    noKeyWarning();
  });

  test('two score zones with the same name', async () => {
    await render(
      <ScoreCard
        range="708–736"
        zones={[
          { name: 'Good', from: 300, to: 600 },
          { name: 'Good', from: 600, to: 900 },
        ]}
        currentZone="Good"
        nowLow={708}
        nowHigh={736}
        footer="f"
      />,
    );

    expect(screen.getByTestId('score-zone-0', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('score-zone-1', hidden)).toBeOnTheScreen();
    noKeyWarning();
  });
});

describe('ScoreCard current-zone marker', () => {
  test('the current zone is underlined (not colour alone); the others are not', async () => {
    await render(
      <ScoreCard
        range="708–736"
        zones={[
          { name: 'Fair', from: 300, to: 600 },
          { name: 'Good', from: 600, to: 900 },
        ]}
        currentZone="Good"
        nowLow={708}
        nowHigh={736}
        footer="f"
      />,
    );

    const line = (name: string) =>
      StyleSheet.flatten(screen.getByText(name, hidden).props.style).textDecorationLine;
    expect(line('Good')).toBe('underline');
    expect(line('Fair')).not.toBe('underline');
  });
});
