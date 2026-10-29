import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router } from 'expo-router';
import {
  checkApplicationGuard,
  predictScore,
  runWhatIf,
  type ScoreEstimate,
  type WhatIfConfig,
  type WhatIfResult,
  type WhatIfScenario,
} from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import type { DemoCard } from '../../demo/types';
import { useCards, useProfile, useRules } from '../../state/DemoRepositoryContext';
import { Screen, Text, announce } from '../../ui';
import { toGuardConfig, toWhatIfConfig, toWhatIfContext, type RulesWithGuard } from './adapter';
import { ScoreHome } from './ScoreHome';
import { WhatIfConfigure } from './WhatIfConfigure';
import { WhatIfOutcomeView } from './WhatIfOutcomeView';
import {
  buildScenario,
  daysSince,
  describeGuard,
  describeOutcome,
  scenarioTitle,
  type GuardView,
  type PlanContext,
  type ScenarioInput,
  type TileKey,
} from './viewModel';

type Step =
  | { name: 'home' }
  | { name: 'configure'; tile: 'pay-card' | 'close-card' | 'fd-card' }
  | { name: 'result'; scenario: WhatIfScenario };

const NEEDS_INPUT = new Set<TileKey>(['pay-card', 'close-card', 'fd-card']);

function isInputTile(tile: TileKey): tile is 'pay-card' | 'close-card' | 'fd-card' {
  return NEEDS_INPUT.has(tile);
}

/** The estimate, or null if the engine rejects the inputs (for example an anchor dated in the future). */
function safeEstimate(run: () => ScoreEstimate): ScoreEstimate | null {
  try {
    return run();
  } catch {
    return null;
  }
}

/** Android back leaves a what-if before it leaves the screen. */
function useBackToScore(active: boolean, onBack: () => void) {
  const handle = useCallback(() => {
    onBack();
    return true;
  }, [onBack]);
  useEffect(() => {
    if (!active) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', handle);
    return () => subscription.remove();
  }, [active, handle]);
}

/** The what-if result, or null when the engine rejects the inputs (a RangeError must not crash). */
function safeWhatIf(
  context: ReturnType<typeof toWhatIfContext>,
  scenario: WhatIfScenario,
  config: WhatIfConfig,
): WhatIfResult | null {
  try {
    return runWhatIf(context, scenario, config);
  } catch {
    return null;
  }
}

/** Tells a screen reader what the what-if answered, since the view swaps in place. */
function useAnnounceResult(step: Step, result: WhatIfResult | null, cards: readonly DemoCard[]) {
  useEffect(() => {
    if (step.name !== 'result' || !result?.ok) return;
    const view = describeOutcome(result);
    announce(
      `If ${scenarioTitle(step.scenario, cards)}: estimated score ${view.afterRange}, ${view.direction} your score.`,
    );
    // Only when a new result opens, not on every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result]);
}

interface HomeExtras {
  withPlan: { low: number; high: number } | null;
  planHelps: boolean;
  guard: GuardView;
}

/** The with-plan range and the application guard for the main view. */
function homeExtras(
  context: ReturnType<typeof toWhatIfContext>,
  plan: PlanContext,
  rules: RulesWithGuard,
): HomeExtras {
  const scenario = buildScenario('follow-plan', {}, plan);
  const planRun = scenario ? safeWhatIf(context, scenario, toWhatIfConfig(rules)) : null;
  const guard = safeGuard(context, rules);
  return {
    withPlan: planRun?.ok ? planRun.after : null,
    planHelps: planRun?.ok === true && describeOutcome(planRun).direction === 'improves',
    guard,
  };
}

const NO_GUARD: GuardView = { warn: false, headline: '', impactLine: '' };

function safeGuard(context: ReturnType<typeof toWhatIfContext>, rules: RulesWithGuard): GuardView {
  try {
    return describeGuard(checkApplicationGuard(context.input, toGuardConfig(rules)));
  } catch {
    return NO_GUARD;
  }
}

/** The Score screen (PRD 5.5, 5.6; docs/design.md 7.5) and its what-if result views. */
export function ScoreScreen() {
  const profile = useProfile();
  const cards = useCards();
  const rules: RulesWithGuard = useRules();
  const [step, setStep] = useState<Step>({ name: 'home' });
  const context = useMemo(() => toWhatIfContext(profile, cards, DEMO_TODAY), [profile, cards]);
  const plan = useMemo(
    () => ({ cards, rules, today: DEMO_TODAY, cash: profile.cashForCards }),
    [cards, rules, profile.cashForCards],
  );
  const estimate = useMemo(() => safeEstimate(() => predictScore(context.input)), [context]);
  // Computed once per data change, not on every render (the what-if engine runs several predictions).
  const home = useMemo(
    () => (estimate ? homeExtras(context, plan, rules) : null),
    [estimate, context, plan, rules],
  );
  const result = useMemo(
    () =>
      step.name === 'result' ? safeWhatIf(context, step.scenario, toWhatIfConfig(rules)) : null,
    [step, context, rules],
  );

  const toHome = useCallback(() => setStep({ name: 'home' }), []);
  useBackToScore(step.name !== 'home', toHome);
  useAnnounceResult(step, result, cards);

  const run = (key: TileKey, input: ScenarioInput) => {
    const scenario = buildScenario(key, input, plan);
    if (scenario) setStep({ name: 'result', scenario });
  };
  const onPickTile = (key: TileKey) => {
    if (isInputTile(key)) setStep({ name: 'configure', tile: key });
    else run(key, {});
  };

  return (
    <View testID="score-screen" style={{ flex: 1 }}>
      {/* key: each step starts at the top instead of inheriting the previous scroll offset. */}
      <Screen scroll key={step.name}>
        {renderStep({ step, estimate, home, result, cards, profile, onPickTile, run, setStep })}
      </Screen>
    </View>
  );
}

interface RenderArgs {
  step: Step;
  estimate: ScoreEstimate | null;
  home: HomeExtras | null;
  result: WhatIfResult | null;
  cards: ReturnType<typeof useCards>;
  profile: ReturnType<typeof useProfile>;
  onPickTile: (key: TileKey) => void;
  run: (key: TileKey, input: ScenarioInput) => void;
  setStep: (step: Step) => void;
}

function renderStep(args: RenderArgs) {
  const { step, estimate, home, result, cards, profile, onPickTile, run, setStep } = args;
  const toHome = () => setStep({ name: 'home' });
  if (step.name === 'configure') {
    return (
      <WhatIfConfigure
        tile={step.tile}
        cards={cards}
        onRun={(input) => run(step.tile, input)}
        onBack={toHome}
      />
    );
  }
  if (step.name === 'result') {
    return (
      <WhatIfOutcomeView
        title={scenarioTitle(step.scenario, cards)}
        view={result?.ok ? describeOutcome(result) : null}
        onBack={toHome}
      />
    );
  }
  if (estimate === null || home === null) {
    return (
      <>
        <Text variant="h1">We can’t estimate your score right now.</Text>
        <Text variant="body" testID="score-unavailable">
          The report date or your details look wrong. Check them and try again.
        </Text>
      </>
    );
  }
  return (
    <ScoreHome
      profile={profile}
      estimate={estimate}
      withPlan={home.withPlan}
      planHelps={home.planHelps}
      daysSinceReport={daysSince(profile.history.anchorDate, DEMO_TODAY)}
      guard={home.guard}
      onPickTile={onPickTile}
      onBackHome={() => router.replace('/home')}
    />
  );
}
