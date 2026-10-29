import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DashedRule } from '../primitives/DashedRule';
import { Text } from '../primitives/Text';
import { cardFinish, color, shadow, space, type CardFinish } from '../theme';
import { overlay } from '../theme/kitB';
import { PopButton, TextAction } from './Buttons';
import { ChipGlyph } from './ChipGlyph';
import { StatusChip } from './StatusChip';

export type HeroPaymentCardProps = {
  finish: CardFinish;
  cardName: string;
  /** For example `BY THU, 22 OCT`. */
  dueChip: string;
  /** The statement amount when the plan clears it, already formatted, for example `₹12,400`. */
  amount: string;
  /** The "By Thu, 22 Oct — clears your full statement" sentence. Rich nodes allowed. */
  sentence: ReactNode;
  /** For example `₹620 of it is your minimum.` Always shown: the minimum is never hidden. */
  minimumLine: string;
  stepsDone: number;
  stepsTotal: number;
  onMarkPaid: () => void;
  onViewPlan: () => void;
};

const SHADOW_OFFSET = 6;

function PlanProgress({
  done,
  total,
  muted,
  testID,
}: {
  done: number;
  total: number;
  muted: string;
  testID: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="overline" style={{ color: muted }}>
        {`THIS MONTH'S PLAN · ${done} of ${total} done`}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: 4 }}
      >
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            testID={`${testID}-segment-${i}`}
            style={{
              flex: 1,
              height: 6,
              backgroundColor: i < done ? color.accent : overlay.heroSegmentEmpty,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Hero payment card for Home (design.md 6.4): the next payment drawn as a physical card in the
 * paying card's finish. The amount is the statement amount when the plan clears it; the minimum is
 * mentioned, never hidden. One filled button ("Mark as paid") and a text action.
 */
export function HeroPaymentCard({
  finish,
  cardName,
  dueChip,
  amount,
  sentence,
  minimumLine,
  stepsDone,
  stepsTotal,
  onMarkPaid,
  onViewPlan,
}: HeroPaymentCardProps) {
  const tone = cardFinish[finish];
  const total = Math.max(0, Math.floor(stepsTotal));
  const done = Math.min(total, Math.max(0, Math.floor(stepsDone)));
  return (
    <View
      testID="hero-card"
      style={{
        marginRight: SHADOW_OFFSET,
        padding: space.heroPad,
        gap: 14,
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.fill,
        boxShadow: shadow.hero,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text variant="overline" style={{ color: tone.muted }}>
          NEXT PAYMENT
        </Text>
        <StatusChip testID="hero-chip" variant="onFinish" dot label={dueChip} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="numXS" style={{ flex: 1 }}>
          {cardName}
        </Text>
        <ChipGlyph finish={finish} />
      </View>
      <Text
        variant="numL"
        numberOfLines={1}
        // An amount must never lose a digit: if it is too wide it shrinks, it never truncates.
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
        minimumFontScale={0.6}
      >
        {amount}
      </Text>
      <Text variant="body" color="ink">
        {sentence}
      </Text>
      <Text variant="bodyS" style={{ color: tone.muted }}>
        {minimumLine}
      </Text>
      <DashedRule color={tone.border} testID="hero-divider" />
      <PlanProgress done={done} total={total} muted={tone.muted} testID="hero" />
      <PopButton label="Mark as paid" onHero onPress={onMarkPaid} testID="hero-mark-paid" />
      <TextAction label="View full plan →" onFinish onPress={onViewPlan} testID="hero-view-plan" />
    </View>
  );
}
