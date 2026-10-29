import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, space } from '../theme';
import { kitShadow } from '../theme/kitB';
import { BeforeAfterBar } from './BeforeAfterBar';
import { PopButton, SecondaryButton } from './Buttons';
import { StatusChip } from './StatusChip';

export type PlanStepState = 'primary' | 'secondary' | 'paid';

export type PlanStepCardProps = {
  /** Zero-based position in the plan. Shown one-based and zero-padded (`01`). */
  index: number;
  /** Overline, for example `PAY THE MINIMUM`. */
  kind: string;
  cardName: string;
  /** Already formatted, for example `₹620`. */
  amount: string;
  /** `label` is the chip text (for example `BY TOMORROW`); `soon` adds the warning glyph and tint. */
  payBy: { label: string; soon: boolean };
  reason: string;
  beforePercent: number;
  afterPercent: number;
  /** For example `19.5% → 18.7%`. */
  barLabel: string;
  state: PlanStepState;
  /** For example `21 OCT`. Shown in the paid state. */
  paidLabel?: string;
  onMarkPaid: () => void;
  onUndo: () => void;
  testID?: string;
};

const SHADOW_MARGIN = 4; // keeps the primary card's 4px shadow inside its column

function PaidBody({ props, testID }: { props: PlanStepCardProps; testID: string }) {
  const { cardName, amount, paidLabel, onUndo } = props;
  return (
    <View style={{ gap: 8 }}>
      <Text
        variant="title"
        color="muted"
        style={{ textDecorationLine: 'line-through' }}
        // The strike-through is visual only; say it in words.
        accessibilityLabel={`${cardName}, ${amount}, paid`}
      >
        {`${cardName} · ${amount}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Text variant="overline" color="success" numberOfLines={1}>
          {paidLabel ? `✓ PAID · ${paidLabel}` : '✓ PAID'}
        </Text>
        <SecondaryButton
          label="Undo"
          accessibilityLabel={`Undo ${cardName}`}
          onPress={onUndo}
          testID={`${testID}-undo`}
        />
      </View>
    </View>
  );
}

function OpenBody({ props, testID }: { props: PlanStepCardProps; testID: string }) {
  const { kind, cardName, amount, payBy, reason, state, onMarkPaid } = props;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="overline">{kind}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <Text variant="title" style={{ flexShrink: 1 }}>
          {cardName}
        </Text>
        <Text
          variant="numS"
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ flexShrink: 0 }}
        >
          {amount}
        </Text>
      </View>
      <StatusChip
        testID={`${testID}-chip`}
        variant={payBy.soon ? 'dueSoon' : 'neutral'}
        label={payBy.soon ? `⚠ ${payBy.label}` : payBy.label}
      />
      <Text variant="bodyS">{reason}</Text>
      <BeforeAfterBar
        beforePercent={props.beforePercent}
        afterPercent={props.afterPercent}
        label={props.barLabel}
        testID={`${testID}-bar`}
      />
      {state === 'primary' ? (
        <PopButton
          label="Mark as paid"
          accessibilityLabel={`Mark ${cardName} ${amount} as paid`}
          size="list"
          onPress={onMarkPaid}
          testID={`${testID}-mark-paid`}
        />
      ) : (
        <SecondaryButton
          label="Mark as paid"
          accessibilityLabel={`Mark ${cardName} ${amount} as paid`}
          onPress={onMarkPaid}
          testID={`${testID}-mark-paid`}
        />
      )}
    </View>
  );
}

/**
 * Plan step card (design.md 6.8). Primary = accent border, accentEdge shadow, pop button.
 * Secondary = hairline border, outline button. Paid = collapsed, struck through, with Undo.
 * Never a checkbox, and a paid step stays in the list.
 */
export function PlanStepCard(props: PlanStepCardProps) {
  const { index, state, testID = `plan-step-${index}` } = props;
  const primary = state === 'primary';
  const paid = state === 'paid';
  const numberColor = primary ? 'link' : paid ? 'muted' : 'ink';
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Text
        variant="numM"
        color={numberColor}
        numberOfLines={1}
        accessibilityLabel={`Step ${index + 1}`}
        style={{ minWidth: 36 }}
      >
        {String(index + 1).padStart(2, '0')}
      </Text>
      <View
        testID={`${testID}-card`}
        style={{
          flex: 1,
          marginRight: SHADOW_MARGIN,
          padding: space.cardPad,
          borderWidth: 1,
          borderColor: primary ? color.accent : color.hairline,
          backgroundColor: color.surface,
          ...(primary ? { boxShadow: kitShadow.stepPrimary } : null),
        }}
      >
        {paid ? (
          <PaidBody props={props} testID={testID} />
        ) : (
          <OpenBody props={props} testID={testID} />
        )}
      </View>
    </View>
  );
}
