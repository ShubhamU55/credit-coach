import { useState } from 'react';
import { View } from 'react-native';
import { BeforeAfterBar } from '../components/BeforeAfterBar';
import { DateBlockTimeline } from '../components/DateBlockTimeline';
import { PaymentTimelineStrip } from '../components/PaymentTimelineStrip';
import { PlanStepCard } from '../components/PlanStepCard';
import { announce } from '../primitives/announce';
import { space } from '../theme';
import { COMING_UP, LANES, STEPS, TIMELINE_LABEL, TODAY_ISO } from './fixtures';
import { Section, StateLabel } from './Section';

const noop = () => {};

type StepState = 'primary' | 'secondary' | 'paid';

export function PlanSection() {
  // Step 0 starts as the primary step; marking it paid hands "primary" to the next unpaid step.
  const [paid, setPaid] = useState<boolean[]>([false, false, true]);
  const firstUnpaid = paid.indexOf(false);
  const setStep = (index: number, value: boolean) => {
    setPaid((prev) => prev.map((p, i) => (i === index ? value : p)));
    announce(value ? 'Marked as paid.' : 'Payment undone.');
  };
  return (
    <Section id="plan" title="Plan visuals">
      <StateLabel>
        Before/after bar: the removed part is hatched, never a second solid colour
      </StateLabel>
      <BeforeAfterBar
        beforePercent={81}
        afterPercent={30}
        label="81.0% → 30.0%"
        testID="kit-before-after"
      />
      <StateLabel>Plan step cards: primary, secondary, paid (interactive)</StateLabel>
      <View style={{ gap: space.cardPad }}>
        {STEPS.map((step, index) => {
          const state: StepState = paid[index]
            ? 'paid'
            : index === firstUnpaid
              ? 'primary'
              : 'secondary';
          return (
            <PlanStepCard
              key={`${step.cardName}-${step.kind}`}
              index={index}
              kind={step.kind}
              cardName={step.cardName}
              amount={step.amount}
              payBy={step.payBy}
              reason={step.reason}
              beforePercent={step.before}
              afterPercent={step.after}
              barLabel={step.barLabel}
              state={state}
              paidLabel="21 OCT"
              onMarkPaid={() => setStep(index, true)}
              onUndo={() => setStep(index, false)}
            />
          );
        })}
      </View>
      <StateLabel>Date-block timeline (Coming up)</StateLabel>
      <DateBlockTimeline items={COMING_UP} onPressItem={noop} />
      <StateLabel>Payment timeline strip: SBI has no Due marker</StateLabel>
      <PaymentTimelineStrip todayIso={TODAY_ISO} lanes={LANES} a11yLabel={TIMELINE_LABEL} />
    </Section>
  );
}
