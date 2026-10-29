import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatINR, formatShortDate } from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { RepositoryError } from '../../demo/types';
import {
  useCards,
  useDemoRepository,
  usePayments,
  useProfile,
  useRules,
} from '../../state/DemoRepositoryContext';
import {
  AmountInput,
  ChoiceRows,
  PopButton,
  RECORD_NOTE,
  SecondaryButton,
  Text,
  announce,
  color,
  space,
} from '../../ui';
import {
  resolveMarkPaid,
  validateOther,
  type MarkPaidParams,
  type OptionKey,
} from './markPaidModel';
import { buildPlanView } from './planModel';

const TILE = 52;

interface Recorded {
  amount: number;
  line: string;
}

/** The one sentence under "Recorded ₹X.": which steps are done and whether the statement is cleared. */
function resultLine(args: {
  cardName: string;
  newlyPaid: number[];
  statementCleared: boolean;
}): string {
  const { cardName, newlyPaid, statementCleared } = args;
  const nums = newlyPaid.map((n) => String(n).padStart(2, '0'));
  let steps = '';
  if (nums.length === 1) steps = `Step ${nums[0]} is done. `;
  else if (nums.length > 1)
    steps = `Steps ${nums.slice(0, -1).join(', ')} and ${nums.at(-1)} are done. `;
  const tail = statementCleared
    ? `${cardName}'s statement is cleared — no interest this cycle.`
    : `The plan is updated for ${cardName}.`;
  return `${steps}${tail}`;
}

function Invalid({ message }: { message: string }) {
  return (
    <View testID="mark-paid-invalid" style={{ gap: space.section, padding: space.gutter }}>
      <Text variant="h1">Nothing to mark as paid</Text>
      <Text variant="body" accessibilityRole="alert">
        {message}
      </Text>
      <SecondaryButton label="Close" onPress={() => router.back()} testID="mark-paid-close" />
    </View>
  );
}

function Done({ recorded }: { recorded: Recorded }) {
  return (
    <View testID="mark-paid-done" style={{ gap: space.section }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: TILE,
          height: TILE,
          marginRight: 4,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.success,
          boxShadow: `4px 4px 0 ${color.successTint}`,
        }}
      >
        <Text variant="h1" color="bg">
          ✓
        </Text>
      </View>
      <Text variant="confirmation" accessibilityRole="header" testID="mark-paid-recorded">
        {`Recorded ${formatINR(recorded.amount)}.`}
      </Text>
      <Text variant="body" testID="mark-paid-result">
        {recorded.line}
      </Text>
      <PopButton
        label="Back to plan"
        size="screen"
        onPress={() => router.back()}
        testID="mark-paid-back"
      />
    </View>
  );
}

export function MarkPaidSheet({ cardId, amount }: MarkPaidParams) {
  const repository = useDemoRepository();
  const cards = useCards();
  const payments = usePayments();
  const rules = useRules();
  const profile = useProfile();
  const params = useMemo(() => ({ cardId, amount }), [cardId, amount]);
  const view = useMemo(
    () =>
      buildPlanView({
        cards,
        payments,
        rules,
        cash: profile.cashForCards,
        today: DEMO_TODAY,
        aimFor10: rules.aimFor10,
      }),
    [cards, payments, rules, profile.cashForCards],
  );
  const resolved = useMemo(() => resolveMarkPaid({ cards, view, params }), [cards, view, params]);

  const [choice, setChoice] = useState<OptionKey | null>(null);
  const [otherText, setOtherText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const submitted = useRef(false);

  if (recorded) return <Done recorded={recorded} />;
  if (resolved.kind === 'invalid') return <Invalid message={resolved.message} />;

  const selected = choice ?? resolved.defaultOption;
  const other = otherText ?? resolved.prefill ?? '';
  const option = resolved.options.find((o) => o.key === selected);
  const validation = validateOther(other, resolved);
  const isOther = selected === 'other';
  const payAmount = isOther ? Number(other || 0) : (option?.amountValue ?? 0);
  const canConfirm = isOther ? validation.canConfirm : payAmount > 0;
  const confirmLabel = isOther ? validation.confirmLabel : 'Confirm payment';

  function confirm() {
    if (submitted.current || !canConfirm) return;
    const { card } = resolved as Extract<typeof resolved, { kind: 'ok' }>;
    const before = new Set(view.steps.filter((s) => s.state === 'paid').map((s) => s.step));
    try {
      repository.recordPayment(card.id, payAmount, DEMO_TODAY);
    } catch (caught) {
      if (caught instanceof RepositoryError) {
        setError(caught.message);
        return;
      }
      throw caught;
    }
    submitted.current = true;
    const after = buildPlanView({
      cards: repository.listCards(),
      payments: repository.listPayments(),
      rules: repository.getRules(),
      cash: profile.cashForCards,
      today: DEMO_TODAY,
      aimFor10: rules.aimFor10,
    });
    const newlyPaid = after.steps
      .filter((s) => s.cardId === card.id && s.state === 'paid' && !before.has(s.step))
      .map((s) => s.step);
    const updated = repository.listCards().find((c) => c.id === card.id);
    const statementCleared =
      !!updated &&
      Math.max(0, updated.lastStatementBalance - updated.paidSinceStatement) === 0 &&
      card.lastStatementBalance - card.paidSinceStatement > 0;
    const line = resultLine({ cardName: card.name, newlyPaid, statementCleared });
    setError(null);
    setRecorded({ amount: payAmount, line });
    announce(`Recorded ${formatINR(payAmount)}. ${line}`);
  }

  return (
    <View testID="mark-paid-sheet" style={{ gap: space.section, padding: space.gutter }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.grid }}>
        <View style={{ flex: 1 }} accessible accessibilityRole="header">
          <Text variant="overline">MARK AS PAID</Text>
          <Text variant="title" testID="mark-paid-subtitle">
            {resolved.subtitle}
          </Text>
        </View>
        <SecondaryButton
          label="Close"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          testID="mark-paid-close"
        />
      </View>
      <Text variant="numL" numberOfLines={1} testID="mark-paid-amount">
        {formatINR(payAmount)}
      </Text>
      <ChoiceRows
        testID="mark-paid-choices"
        options={resolved.options}
        value={selected}
        onChange={(key) => {
          setChoice(key);
          setError(null);
        }}
      />
      {isOther ? (
        <AmountInput
          label="Amount you paid"
          value={other}
          onChangeText={setOtherText}
          status={validation.status}
          message={validation.message}
          testID="mark-paid-other"
        />
      ) : null}
      <Text variant="bodyS" testID="mark-paid-note">
        {`Paid on today, ${formatShortDate(DEMO_TODAY).split(', ')[1]} · ${RECORD_NOTE}`}
      </Text>
      {error ? (
        <Text variant="bodyS" color="error" accessibilityRole="alert" testID="mark-paid-error">
          {error}
        </Text>
      ) : null}
      <PopButton
        label={confirmLabel}
        size="screen"
        disabled={!canConfirm}
        onPress={confirm}
        testID="mark-paid-confirm"
      />
    </View>
  );
}
