import { View } from 'react-native';

import {
  PopButton,
  ReasonRow,
  ScoreRangeText,
  Text,
  TextAction,
  WhatIfResult,
  color,
  space,
} from '../../ui';
import { WHATIF_FAILED, type OutcomeView } from './viewModel';

export interface WhatIfOutcomeViewProps {
  /** For example "you close HDFC Millennia". */
  title: string;
  /** Null when the engine refused the scenario (unknown card, bad amount). */
  view: OutcomeView | null;
  onBack: () => void;
}

function WarningLine({ testID, children }: { testID: string; children: string }) {
  return (
    <Text variant="bodyS" color="warning" testID={testID}>
      {children}
    </Text>
  );
}

function GuardPanel({ guard }: { guard: NonNullable<OutcomeView['guard']> }) {
  const tone = guard.hasWarning ? 'warning' : 'body';
  return (
    <View
      testID="score-result-guard"
      style={{
        padding: space.cardPad,
        gap: 6,
        borderWidth: 1,
        borderColor: guard.hasWarning ? color.warning : color.hairline,
        backgroundColor: guard.hasWarning ? color.warningTint : color.surface,
      }}
    >
      {guard.hasWarning ? (
        <Text variant="title" color="warning">
          <Text
            variant="title"
            color="warning"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            ⚠{' '}
          </Text>
          Think before you apply
        </Text>
      ) : (
        <Text variant="overline">BEFORE YOU APPLY</Text>
      )}
      <Text variant="bodyS" color={tone}>
        {guard.headline}
      </Text>
      <Text variant="bodyS" color={tone}>
        {guard.impactLine}
      </Text>
    </View>
  );
}

function Details({ view }: { view: OutcomeView }) {
  return (
    <View style={{ gap: space.grid }}>
      {view.oldestAccountLine ? (
        <WarningLine testID="score-oldest-account">{view.oldestAccountLine}</WarningLine>
      ) : null}
      {view.limitLine ? (
        <WarningLine testID="score-limit-loss">{view.limitLine}</WarningLine>
      ) : null}
      <Text variant="bodyS" testID="score-util-overall">
        {view.utilizationLines.overall}
      </Text>
      <Text variant="bodyS" testID="score-util-highest">
        {view.utilizationLines.highest}
      </Text>
    </View>
  );
}

/** A what-if result (docs/design.md section 12 "Not designed yet": minimal, kit components only). */
export function WhatIfOutcomeView({ title, view, onBack }: WhatIfOutcomeViewProps) {
  if (view === null) {
    return (
      <>
        <TextAction label="Back to score" onPress={onBack} testID="score-whatif-back" />
        <Text variant="body" testID="score-result-error">
          {WHATIF_FAILED}
        </Text>
      </>
    );
  }
  return (
    <View testID="score-result" style={{ gap: 20 }}>
      <TextAction label="Back to score" onPress={onBack} testID="score-whatif-back" />
      <Text variant="overline">WHAT IF</Text>
      <Text variant="h1">{`If ${title}`}</Text>
      <View style={{ gap: 4 }}>
        <Text variant="overline">NOW</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}
        >
          <ScoreRangeText range={view.beforeRange} size="M" testID="score-before" />
          <Text variant="estimateTag">estimate</Text>
        </View>
      </View>
      <WhatIfResult range={view.afterRange} direction={view.direction} variant={view.variant} />
      <Details view={view} />
      {view.guard ? <GuardPanel guard={view.guard} /> : null}
      <View style={{ gap: space.grid }}>
        <Text variant="overline">WHAT MOVED</Text>
        {view.reasons.length > 0 ? (
          view.reasons.map((row) => (
            <ReasonRow key={row.key} title={row.title} direction={row.direction} />
          ))
        ) : (
          <Text variant="bodyS" color="muted">
            Nothing in your score factors moves.
          </Text>
        )}
      </View>
      <PopButton label="Try another what-if" onPress={onBack} testID="score-whatif-again" />
    </View>
  );
}
