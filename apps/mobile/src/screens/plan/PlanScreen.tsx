import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { useCards, usePayments, useProfile, useRules } from '../../state/DemoRepositoryContext';
import {
  AIExplanation,
  AmountInput,
  FloatingNav,
  Header,
  PaymentTimelineStrip,
  PlanStepCard,
  Screen,
  SwitchRow,
  Text,
  TextAction,
  announce,
  color,
  space,
  type NavTab,
} from '../../ui';
import { buildPlanView, type PlanView, type StepView } from './planModel';

function initialsOf(name: string): string {
  const words = name.split(' ').filter((w) => /^[A-Za-z]/.test(w));
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

function openNav(tab: NavTab) {
  if (tab === 'home') router.navigate('/home');
  else if (tab === 'score') router.navigate('/score');
}

function explainText(view: PlanView): string {
  const parts = [view.summary];
  if (view.plan.overallUtilizationAfter !== null) {
    parts.push(
      `Overall utilization goes from ${view.utilizationBefore} to ${view.utilizationAfter}, and your highest card from ${view.highestBefore} to ${view.highestAfter}.`,
    );
  }
  return parts.join(' ');
}

function Steps({ steps }: { steps: StepView[] }) {
  return (
    <View style={{ gap: space.cardPad }}>
      {steps.map((s, index) => (
        <PlanStepCard
          key={s.id}
          index={index}
          testID={s.id}
          kind={s.kind}
          cardName={s.cardName}
          amount={s.amountLabel}
          payBy={{ label: s.payByLabel, soon: s.soon }}
          reason={s.reason}
          beforePercent={s.before}
          afterPercent={s.after}
          barLabel={s.barLabel}
          state={s.state}
          paidLabel={s.paidLabel}
          onMarkPaid={() => router.push({ pathname: '/mark-paid', params: { cardId: s.cardId } })}
          onUndo={() => announce('Undo is not available in the demo yet.')}
        />
      ))}
    </View>
  );
}

function CashRow({ cash, onChange }: { cash: string; onChange: (digits: string) => void }) {
  const [editing, setEditing] = useState(false);
  const shown = formatINR(cash === '' ? 0 : Number(cash));
  return (
    <View style={{ gap: 4 }}>
      <Text variant="overline">CASH FOR CARDS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        {editing ? (
          <View style={{ flex: 1, minWidth: 160 }}>
            <AmountInput
              inline
              label="Cash for cards"
              value={cash}
              onChangeText={onChange}
              testID="plan-cash-input"
            />
          </View>
        ) : (
          <Text variant="numM" numberOfLines={1} testID="plan-cash">
            {shown}
          </Text>
        )}
        <TextAction
          label={editing ? 'DONE' : '✎ EDIT'}
          accessibilityLabel={editing ? 'Done editing cash for cards' : 'Edit cash for cards'}
          onPress={() => setEditing((v) => !v)}
          testID="plan-cash-edit"
        />
      </View>
    </View>
  );
}

function Outcome({ view }: { view: PlanView }) {
  return (
    <View style={{ gap: 6 }} testID="plan-outcome">
      <Text variant="overline">AFTER THIS PLAN · UTILIZATION</Text>
      <View
        accessible
        accessibilityLabel={`Overall utilization ${view.utilizationBefore} to ${view.utilizationAfter}`}
        style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}
      >
        <Text
          variant="numM"
          color="muted"
          style={{ textDecorationLine: 'line-through' }}
          testID="plan-util-before"
        >
          {view.utilizationBefore}
        </Text>
        <Text variant="numM" color="muted">
          →
        </Text>
        <Text variant="numL" color="success" testID="plan-util-after">
          {view.utilizationAfter}
        </Text>
      </View>
      <Text variant="bodyS" testID="plan-highest">
        {`Highest card ${view.highestBefore} → ${view.highestAfter}`}
      </Text>
      <Text variant="bodyS" testID="plan-summary">
        {view.summary}
      </Text>
    </View>
  );
}

function Shortfalls({ view }: { view: PlanView }) {
  if (view.shortfalls.length === 0) return null;
  return (
    <View
      testID="plan-shortfalls"
      style={{
        gap: 8,
        padding: space.cardPad,
        borderWidth: 2,
        borderColor: color.warning,
        backgroundColor: color.surface,
      }}
    >
      <Text variant="overline" color="warning">
        ⚠ NOT ENOUGH CASH FOR EVERY MINIMUM
      </Text>
      {view.shortfalls.map((s) => (
        <Text key={s.cardId} variant="bodyS" testID={`plan-shortfall-${s.cardId}`}>
          {s.text}
        </Text>
      ))}
    </View>
  );
}

export function PlanScreen() {
  const cards = useCards();
  const payments = usePayments();
  const rules = useRules();
  const profile = useProfile();
  const [aimFor10, setAimFor10] = useState(rules.aimFor10);
  const [cashText, setCashText] = useState(String(profile.cashForCards));
  const cash = cashText === '' ? 0 : Number(cashText);

  // Recomputed from the repository's current state on every change (PRD 5.3: never frozen).
  const view = useMemo(
    () => buildPlanView({ cards, payments, rules, cash, today: DEMO_TODAY, aimFor10 }),
    [cards, payments, rules, cash, aimFor10],
  );

  return (
    <View testID="plan-screen" style={{ flex: 1, backgroundColor: color.bg }}>
      <Screen scroll>
        <Header
          initials={initialsOf(profile.name)}
          remindersNew={0}
          onReminders={() => announce('Reminders are not available in the demo yet.')}
          onAccount={() => announce('Account settings are not available in the demo yet.')}
          sample={profile.isSample ? { onSwitch: () => router.replace('/') } : undefined}
        />
        <View style={{ gap: 6 }}>
          <Text variant="overline" testID="plan-period">
            {view.periodLabel}
          </Text>
          <Text variant="h1">
            Your plan for the{' '}
            <Text variant="h1" style={{ fontStyle: 'italic' }}>
              next 30 days.
            </Text>
          </Text>
        </View>
        <CashRow cash={cashText} onChange={setCashText} />
        <Outcome view={view} />
        <PaymentTimelineStrip
          todayIso={DEMO_TODAY}
          lanes={view.lanes}
          a11yLabel={view.timelineLabel}
        />
        <Shortfalls view={view} />
        <View style={{ gap: space.cardPad }}>
          <Text variant="overline" testID="plan-steps-heading">
            {`${view.steps.length} ${view.steps.length === 1 ? 'STEP' : 'STEPS'}, IN ORDER`}
          </Text>
          <Steps steps={view.steps} />
        </View>
        <View
          style={{
            padding: space.cardPad,
            gap: 8,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.hairline,
          }}
        >
          <Text variant="overline">LEFT OVER</Text>
          <Text variant="numL" color="success" testID="plan-leftover">
            {view.leftoverLabel}
          </Text>
          <View style={{ height: 1, backgroundColor: color.hairline }} />
          <SwitchRow
            testID="plan-aim-switch"
            title="Aim for 10% utilization"
            captionOn={`Cards are paid down toward ${rules.excellentPct}%, not just ${rules.thresholdPct}%.`}
            captionOff={`Cards are paid down to ${rules.thresholdPct}%, then the plan stops.`}
            value={aimFor10}
            onValueChange={setAimFor10}
          />
        </View>
        <AIExplanation text={explainText(view)} aiWritten={false} />
      </Screen>
      <FloatingNav active="plan" onNavigate={openNav} />
    </View>
  );
}
