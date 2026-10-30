import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

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
  chosenAmount,
  parsePlanParams,
  recordAndSummarise,
  rejectedPlanParams,
  resolveMarkPaid,
  validateOther,
  type MarkPaidParams,
  type OptionKey,
  type PaymentSummary,
} from './markPaidModel';
import { buildPlanView, shortDayMonth } from './planModel';

const TILE = 52;
const GRABBER = { width: 40, height: 4 };
const SHEET_TOP_PAD = space.grid;
const SHEET_BOTTOM_PAD = space.section;

/**
 * The sheet's root (design.md 6.19): modal for screen readers, a `line` top border, a grabber and
 * padding 12/20/28. The route is a full screen, so there is no scrim here.
 *
 * Edge-to-edge: the sheet runs under the system navigation bar, so with 3-button navigation the
 * bottom action would sit under the Back button. The bottom padding therefore grows by the bottom
 * safe-area inset (0 in gesture mode, so that layout is unchanged), and the frame scrolls so the
 * actions stay reachable on the 0.6 detent. The context is read directly (null without a provider
 * means 0) because `useSafeAreaInsets` throws outside one.
 */
function SheetFrame({ children, ...rest }: ViewProps) {
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return (
    <ScrollView
      testID="mark-paid-scroll"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View
        accessibilityViewIsModal
        {...rest}
        style={{
          gap: space.section,
          paddingTop: SHEET_TOP_PAD,
          paddingHorizontal: space.gutter,
          paddingBottom: SHEET_BOTTOM_PAD + bottomInset,
          borderTopWidth: 1,
          borderTopColor: color.line,
        }}
      >
        <View
          testID="mark-paid-grabber"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ alignSelf: 'center', ...GRABBER, backgroundColor: color.line }}
        />
        {children}
      </View>
    </ScrollView>
  );
}

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
    <SheetFrame testID="mark-paid-invalid">
      <View ref={focusRef} accessible accessibilityRole="header">
        <Text variant="h1">{title}</Text>
      </View>
      <Text variant="body" accessibilityRole="alert">
        {message}
      </Text>
      <SecondaryButton label="Close" onPress={leave} testID="mark-paid-close" />
    </SheetFrame>
  );
}

function Done({ recorded }: { recorded: PaymentSummary }) {
  const focusRef = useFocusOnMount();
  return (
    <SheetFrame testID="mark-paid-done">
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
    </SheetFrame>
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

  const rejected = rejectedPlanParams(props).join(', ');
  useEffect(() => {
    if (__DEV__ && rejected) {
      console.warn(
        `[mark-paid] ignored invalid deep-link param(s): ${rejected}; using the stored values.`,
      );
    }
  }, [rejected]);

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
  const validation = validateOther(other, resolved);
  const isOther = selected === 'other';
  const payAmount = chosenAmount({ selected, options: resolved.options, other });
  const isConfirmable = isOther ? validation.isConfirmable : payAmount > 0;

  function confirm() {
    if (submitted.current || !isConfirmable) return;
    // Set before recording so a second tap in the same render cannot record twice.
    submitted.current = true;
    try {
      onConfirm(resolved.card, payAmount);
    } catch (caught) {
      // recordAndSummarise only throws when recordPayment itself did (nothing was written), so a
      // retry is safe here. A failure after the write is absorbed there and never reaches this.
      submitted.current = false;
      if (!(caught instanceof RepositoryError)) throw caught;
      setError(caught.message);
    }
  }

  return (
    <SheetFrame testID="mark-paid-sheet">
      {/* row-reverse: Close is first in the tree (first in focus order) but sits on the right. */}
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: space.grid }}>
        <SecondaryButton label="Close" onPress={leave} testID="mark-paid-close" />
        <View
          ref={headerRef}
          testID="mark-paid-header"
          style={{ flex: 1 }}
          accessible
          accessibilityRole="header"
        >
          <Text variant="overline">MARK AS PAID</Text>
          <Text variant="title" testID="mark-paid-subtitle">
            {resolved.subtitle}
          </Text>
        </View>
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
        {`Paid today, ${shortDayMonth(DEMO_TODAY)} · ${RECORD_NOTE}`}
      </Text>
      {error ? (
        <Text variant="bodyS" color="error" accessibilityRole="alert" testID="mark-paid-error">
          {error}
        </Text>
      ) : null}
      <PopButton
        label={isOther ? validation.confirmLabel : 'Confirm payment'}
        size="screen"
        disabled={!isConfirmable}
        onPress={confirm}
        testID="mark-paid-confirm"
      />
    </SheetFrame>
  );
}
