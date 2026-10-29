import { useState } from 'react';
import { View } from 'react-native';
import { formatScoreRange, formatShortDate, type ScoreEstimate } from '@credit-coach/engine';

import type { DemoProfile } from '../../demo/types';
import {
  DashedRule,
  ReasonRow,
  ScoreCard,
  Text,
  TextAction,
  WhatIfTile,
  color,
  fontFamily,
  space,
} from '../../ui';
import {
  WHAT_IF_TILES,
  checkedAgo,
  reasonRows,
  scoreHeadline,
  zoneSpecs,
  type GuardView,
  type TileKey,
} from './viewModel';

export interface ScoreHomeProps {
  profile: DemoProfile;
  estimate: ScoreEstimate;
  /** The range with the plan followed, or null when the plan could not be run. */
  withPlan: { low: number; high: number } | null;
  planHelps: boolean;
  daysSinceReport: number;
  guard: GuardView;
  onPickTile: (key: TileKey) => void;
  onBackHome: () => void;
}

const HOW_WE_ESTIMATE =
  'We start from the last score your report showed, then adjust it for what we can see today: how much of your limits you use, your payment history, new applications, account age and mix. The range widens as the report gets older. It is an estimate, not your CIBIL score.';

/** Tile glyphs are decorative; the label carries the meaning. */
function Glyph({ children, suggested }: { children: string; suggested: boolean }) {
  return (
    <Text variant="title" color={suggested ? 'link' : 'muted'}>
      {children}
    </Text>
  );
}

function Headline({ zone, planHelps }: { zone: string; planHelps: boolean }) {
  const { before, zone: word, after } = scoreHeadline(zone, planHelps);
  return (
    <Text variant="h1">
      {before}
      <Text variant="h1" style={{ fontFamily: fontFamily.serifItalic }}>
        {word}
      </Text>
      {after}
    </Text>
  );
}

function GuardBanner({ guard }: { guard: GuardView }) {
  return (
    <View
      testID="score-guard"
      accessible
      accessibilityLabel={`Warning. ${guard.headline} ${guard.impactLine}`}
      style={{
        padding: space.cardPad,
        gap: 6,
        borderWidth: 1,
        borderColor: color.warning,
        backgroundColor: color.warningTint,
      }}
    >
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
      <Text variant="bodyS" color="warning">
        {guard.headline}
      </Text>
      <Text variant="bodyS" color="warning">
        {guard.impactLine}
      </Text>
    </View>
  );
}

/** The main Score view (design.md 7.5). */
export function ScoreHome({
  profile,
  estimate,
  withPlan,
  planHelps,
  daysSinceReport,
  guard,
  onPickTile,
  onBackHome,
}: ScoreHomeProps) {
  const [explaining, setExplaining] = useState(false);
  const { anchorScore, anchorDate } = profile.history;
  const range = formatScoreRange(estimate.low, estimate.high);
  const rows = reasonRows(estimate.reasons);
  const reported = `Last reported ${anchorScore} on ${formatShortDate(anchorDate)}${profile.isSample ? ' · sample report' : ''}`;
  return (
    <>
      <Text variant="overline">{`YOUR SCORE · ${checkedAgo(daysSinceReport)}`}</Text>
      <Headline zone={estimate.band} planHelps={planHelps} />
      <ScoreCard
        range={range}
        zones={zoneSpecs()}
        currentZone={estimate.band}
        nowLow={estimate.low}
        nowHigh={estimate.high}
        withPlan={
          withPlan
            ? {
                range: formatScoreRange(withPlan.low, withPlan.high),
                low: withPlan.low,
                high: withPlan.high,
              }
            : undefined
        }
        footer={estimate.isRoughBand ? 'A rough estimate: no report to anchor it yet.' : reported}
      />
      {guard.warn ? <GuardBanner guard={guard} /> : null}
      {rows.length > 0 ? (
        <View style={{ gap: space.grid }}>
          <Text variant="overline">WHAT’S MOVING IT</Text>
          {rows.map((row) => (
            <ReasonRow key={row.key} title={row.title} direction={row.direction} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: space.grid }}>
        <Text variant="overline">TRY A WHAT-IF</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.grid }}>
          {WHAT_IF_TILES.map((tile) => (
            <View key={tile.key} style={{ width: '48%', flexGrow: 1 }}>
              <WhatIfTile
                icon={<Glyph suggested={tile.suggested}>{tile.glyph}</Glyph>}
                label={tile.label}
                suggested={tile.suggested}
                onPress={() => onPickTile(tile.key)}
                testID={`score-tile-${tile.key}`}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <DashedRule color={color.rule} />
        <Text variant="caption" color="muted">
          Checking your own score never lowers it.
        </Text>
        <TextAction
          label="How we estimate"
          onPress={() => setExplaining((open) => !open)}
          testID="score-how-we-estimate"
        />
        {explaining ? (
          <Text variant="bodyS" testID="score-how-text">
            {HOW_WE_ESTIMATE}
          </Text>
        ) : null}
        <TextAction label="Back to Home" onPress={onBackHome} testID="score-link-home" />
      </View>
    </>
  );
}
