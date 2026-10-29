import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { formatINR } from '@credit-coach/engine';

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
  parsePlanParams,
  recordAndSummarise,
  resolveMarkPaid,
  validateOther,
  type MarkPaidParams,
  type OptionKey,
  type PaymentSummary,
} from './markPaidModel';
import { buildPlanView, shortDayMonth } from './planModel';

const TILE = 52;

/** Back to wherever the sheet was opened from; a cold deep link has no history, so go to the plan. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/plan');
}

/** Moves screen-reader focus to the returned node once it is mounted. */
function useFocusOnMount() {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, []);
  return ref;
}

function Invalid({ title, message }: { title: string; message: string }) {
  const focusRef = useFocusOnMount();
  return (
    <View testID="mark-paid-invalid" style={{ gap: space.section, padding: space.gutter }}>
      <View ref={focusRef} accessible accessibilityRole="header">
        <Text variant="h1">{title}</Text>
      </View>
      <Text variant="body" accessibilityRole="alert">
        {message}
      </Text>
      <SecondaryButton label="Close" onPress={leave} testID="mark-paid-close" />
    </View>
  );
}

function Done({ recorded }: { recorded: PaymentSummary }) {
  const focusRef = useFocusOnMount();
  return (
    <View testID="mark-paid-done" style={{ gap: space.section, padding: space.gutter }}>
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
      <View ref={focusRef} accessible accessibilityRole="header">
        <Text variant="confirmation" testID="mark-paid-recorded">
          {`Recorded ${formatINR(recorded.amount)}.`}
        </Text>
      </View>
      <Text variant="body" testID="mark-paid-result">
        {recorded.line}
      </Text>
      <PopButton label="Back to plan" size="screen" onPress={leave} testID="mark-paid-back" />
    </View>
  );
}

export function MarkPaidSheet(props: MarkPaidParams) {
  const repository = useDemoRepository();
  const cards = useCards();
  const payments = usePayments();
  const rules = useRules();
  const profile = useProfile();
  const [recorded, setRecorded] = useState<PaymentSummary | null>(null);
  const { aimFor10, cash } = parsePlanParams(props, {
    aimFor10: rules.aimFor10,
    cash: profile.cashForCards,
  });
  const view = useMemo(
    () => buildPlanView({ cards, payments, rules, cash, today: DEMO_TODAY, aimFor10 }),
    [cards, payments, rules, cash, aimFor10],
  );
  const { cardId, amount } = props;
  const resolved = useMemo(
    () => resolveMarkPaid({ cards, view, params: { cardId, amount } }),
    [cards, view, cardId, amount],
  );

  if (recorded) return <Done recorded={recorded} />;
  if (resolved.kind === 'invalid') {
    return <Invalid title={resolved.title} message={resolved.message} />;
  }
  return (
    <SheetForm
      resolved={resolved}
      onConfirm={(card, payAmount) => {
        const summary = recordAndSummarise({
          repository,
          card,
          amount: payAmount,
          today: DEMO_TODAY,
          cash,
          aimFor10,
          before: view,
        });
        setRecorded(summary);
        announce(`Recorded ${formatINR(summary.amount)}. ${summary.line}`);
      }}
    />
  );
}

type OkResolved = Extract<ReturnType<typeof resolveMarkPaid>, { kind: 'ok' }>;

function SheetForm({
  resolved,
  onConfirm,
}: {
  resolved: OkResolved;
  onConfirm: (card: OkResolved['card'], amount: number) => void;
}) {
  const headerRef = useFocusOnMount();
  const [choice, setChoice] = useState<OptionKey | null>(null);
  const [otherText, setOtherText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  const selected = choice ?? resolved.defaultOption;
  const other = otherText ?? resolved.prefill ?? '';
  const option = resolved.options.find((o) => o.key === selected);
  const validation = validateOther(other, resolved);
  const isOther = selected === 'other';
  const payAmount = isOther ? Number(other || 0) : (option?.amountValue ?? 0);
  const canConfirm = isOther ? validation.canConfirm : payAmount > 0;

  function confirm() {
    if (submitted.current || !canConfirm) return;
    try {
      onConfirm(resolved.card, payAmount);
      submitted.current = true;
    } catch (caught) {
      if (!(caught instanceof RepositoryError)) throw caught;
      setError(caught.message);
    }
  }

  return (
    <View testID="mark-paid-sheet" style={{ gap: space.section, padding: space.gutter }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.grid }}>
        <View ref={headerRef} style={{ flex: 1 }} accessible accessibilityRole="header">
          <Text variant="overline">MARK AS PAID</Text>
          <Text variant="title" testID="mark-paid-subtitle">
            {resolved.subtitle}
          </Text>
        </View>
        <SecondaryButton label="Close" onPress={leave} testID="mark-paid-close" />
      </View>
      <Text variant="numL" testID="mark-paid-amount">
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
        {`Paid on today, ${shortDayMonth(DEMO_TODAY)} · ${RECORD_NOTE}`}
      </Text>
      {error ? (
        <Text variant="bodyS" color="error" accessibilityRole="alert" testID="mark-paid-error">
          {error}
        </Text>
      ) : null}
      <PopButton
        label={isOther ? validation.confirmLabel : 'Confirm payment'}
        size="screen"
        disabled={!canConfirm}
        onPress={confirm}
        testID="mark-paid-confirm"
      />
    </View>
  );
}
