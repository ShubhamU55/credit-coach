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
      <Screen scroll>
        {renderStep({ step, estimate, context, plan, cards, profile, onPickTile, run, setStep })}
      </Screen>
    </View>
  );
}

interface RenderArgs {
  step: Step;
  estimate: ScoreEstimate | null;
  context: ReturnType<typeof toWhatIfContext>;
  plan: Parameters<typeof buildScenario>[2];
  cards: ReturnType<typeof useCards>;
  profile: ReturnType<typeof useProfile>;
  onPickTile: (key: TileKey) => void;
  run: (key: TileKey, input: ScenarioInput) => void;
  setStep: (step: Step) => void;
}

function renderStep(args: RenderArgs) {
  const { step, estimate, context, plan, cards, profile, onPickTile, run, setStep } = args;
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
    const result: WhatIfResult = runWhatIf(context, step.scenario);
    return (
      <WhatIfOutcomeView
        title={scenarioTitle(step.scenario, cards)}
        view={result.ok ? describeOutcome(result) : null}
        onBack={toHome}
      />
    );
  }
  if (estimate === null) {
    return (
      <>
        <Text variant="h1">We can’t estimate your score right now.</Text>
        <Text variant="body" testID="score-unavailable">
          The report date or your details look wrong. Check them and try again.
        </Text>
      </>
    );
  }
  const planRun = runWhatIf(context, buildScenario('follow-plan', {}, plan) as WhatIfScenario);
  const planView = planRun.ok ? describeOutcome(planRun) : null;
  return (
    <ScoreHome
      profile={profile}
      estimate={estimate}
      withPlan={planRun.ok ? planRun.after : null}
      planHelps={planView?.direction === 'improves'}
      daysSinceReport={daysSince(profile.history.anchorDate, DEMO_TODAY)}
      guard={describeGuard(checkApplicationGuard(context.input))}
      onPickTile={onPickTile}
      onBackHome={() => router.replace('/home')}
    />
  );
}
