import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BeforeAfterBar } from './BeforeAfterBar';
import { DateBlockTimeline } from './DateBlockTimeline';
import { HeroPaymentCard } from './HeroPaymentCard';
import { PaymentTimelineStrip } from './PaymentTimelineStrip';
import { PlanStepCard } from './PlanStepCard';
import { ScoreCard } from './ScoreCard';

// Ranges and amounts must never wrap or truncate at 200% font (design.md 3, 10). They cannot
// shrink, so each is one line, does not shrink in a row, and stops growing past 1.3x.
function expectNeverTruncates(text: string) {
  const node = screen.getByText(text);
  expect(node).toHaveProp('numberOfLines', 1);
  expect(node.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
  expect(StyleSheet.flatten(node.props.style).flexShrink).toBe(0);
}

describe('large font: ranges and amounts', () => {
  test('timeline pay label', async () => {
    await render(
      <PaymentTimelineStrip
        todayIso="2026-10-21"
        a11yLabel="x"
        lanes={[{ cardName: 'A', payBy: { iso: '2026-10-22', label: '₹12,400 · 22 Oct' } }]}
      />,
    );

    expectNeverTruncates('₹12,400 · 22 Oct');
  });

  test('date-block amount and before/after label', async () => {
    await render(
      <>
        <DateBlockTimeline
          items={[
            { day: 'Thu', date: '22', month: 'Oct', title: 'T', reason: 'r', amount: '₹12,400' },
          ]}
          onPressItem={() => {}}
        />
        <BeforeAfterBar beforePercent={20} afterPercent={10} label="20.0% → 10.0%" />
      </>,
    );

    expectNeverTruncates('₹12,400');
    expectNeverTruncates('20.0% → 10.0%');
  });

  test('plan step amount', async () => {
    await render(
      <PlanStepCard
        index={0}
        kind="K"
        cardName="Axis Neo"
        amount="₹620"
        payBy={{ label: 'B', soon: false }}
        reason="r"
        beforePercent={2}
        afterPercent={1}
        barLabel="2.0% → 1.0%"
        state="primary"
        onMarkPaid={() => {}}
        onUndo={() => {}}
      />,
    );

    expectNeverTruncates('₹620');
  });

  test('score card plan-lane range', async () => {
    await render(
      <ScoreCard
        range="708–736"
        zones={[{ name: 'Good', from: 300, to: 900 }]}
        currentZone="Good"
        nowLow={708}
        nowHigh={736}
        withPlan={{ range: '724–752', low: 724, high: 752 }}
        footer="f"
      />,
    );

    expectNeverTruncates('With plan · 724–752');
  });

  test('hero amount stops growing at 1.3x (it already shrinks rather than truncate)', async () => {
    await render(
      <HeroPaymentCard
        finish="plum"
        cardName="Axis Neo"
        dueChip="BY THU"
        amount="₹12,400"
        sentence="s"
        minimumLine="m"
        stepsDone={0}
        stepsTotal={5}
        onMarkPaid={() => {}}
        onViewPlan={() => {}}
      />,
    );

    const amount = screen.getByText('₹12,400');
    expect(amount).toHaveProp('numberOfLines', 1);
    expect(amount.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
  });
});
