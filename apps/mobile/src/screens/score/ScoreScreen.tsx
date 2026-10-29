import { useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router } from 'expo-router';
import {
  checkApplicationGuard,
  predictScore,
  runWhatIf,
  type ScoreEstimate,
  type WhatIfResult,
  type WhatIfScenario,
} from '@credit-coach/engine';

import { DEMO_TODAY } from '../../demo/config';
import { useCards, useProfile, useRules } from '../../state/DemoRepositoryContext';
import { Screen, Text } from '../../ui';
import { toWhatIfContext } from './adapter';
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
  useEffect(() => {
    if (!active) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [active, onBack]);
}

interface HomeExtras {
  withPlan: { low: number; high: number } | null;
  planHelps: boolean;
  guard: GuardView;
}

/** The with-plan range and the application guard for the main view. */
function homeExtras(context: ReturnType<typeof toWhatIfContext>, plan: PlanContext): HomeExtras {
  const planRun = runWhatIf(context, buildScenario('follow-plan', {}, plan) as WhatIfScenario);
  return {
    withPlan: planRun.ok ? planRun.after : null,
    planHelps: planRun.ok && describeOutcome(planRun).direction === 'improves',
    guard: describeGuard(checkApplicationGuard(context.input)),
  };
}

/** The Score screen (PRD 5.5, 5.6; docs/design.md 7.5) and its what-if result views. */
export function ScoreScreen() {
  const profile = useProfile();
  const cards = useCards();
  const rules = useRules();
  const [step, setStep] = useState<Step>({ name: 'home' });
  const context = useMemo(() => toWhatIfContext(profile, cards, DEMO_TODAY), [profile, cards]);
  const plan = useMemo(
    () => ({ cards, rules, today: DEMO_TODAY, cash: profile.cashForCards }),
    [cards, rules, profile.cashForCards],
  );
  const estimate = useMemo(() => safeEstimate(() => predictScore(context.input)), [context]);
  // Computed once per data change, not on every render (the what-if engine runs several predictions).
  const home = useMemo(
    () => (estimate ? homeExtras(context, plan) : null),
    [estimate, context, plan],
  );
  const result = useMemo(
    () => (step.name === 'result' ? runWhatIf(context, step.scenario) : null),
    [step, context],
  );

  useBackToScore(step.name !== 'home', () => setStep({ name: 'home' }));

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
  if (step.name === 'result' && result) {
    return (
      <WhatIfOutcomeView
        title={scenarioTitle(step.scenario, cards)}
        view={result.ok ? describeOutcome(result) : null}
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
