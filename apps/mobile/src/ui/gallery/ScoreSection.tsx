import { View } from 'react-native';
import { ScoreCard } from '../components/ScoreCard';
import { ScoreRangeText } from '../components/ScoreRangeText';
import { WhatIfResult } from '../components/WhatIfResult';
import { WhatIfTile } from '../components/WhatIfTile';
import { Text } from '../primitives/Text';
import { space } from '../theme';
import { PLAN_SCORE_RANGE, SCORE_RANGE, WHAT_IFS, ZONES } from './fixtures';
import { Section, StateLabel } from './Section';

const noop = () => {};
const FOOTER = 'Last reported 724 on 2 Oct · sample report';

export function ScoreSection() {
  return (
    <Section id="score" title="Score visuals">
      <StateLabel>Score range text: XL and M, one line each</StateLabel>
      <ScoreRangeText range={SCORE_RANGE} size="XL" testID="kit-range-xl" />
      <ScoreRangeText range={SCORE_RANGE} size="M" testID="kit-range-m" />
      <StateLabel>Score card, current range only</StateLabel>
      <ScoreCard
        range={SCORE_RANGE}
        zones={ZONES}
        currentZone="Good"
        nowLow={708}
        nowHigh={736}
        footer={FOOTER}
        testID="kit-score-card"
      />
      <StateLabel>Score card with the plan lane on its own row</StateLabel>
      <ScoreCard
        range={SCORE_RANGE}
        zones={ZONES}
        currentZone="Good"
        nowLow={708}
        nowHigh={736}
        withPlan={{ range: PLAN_SCORE_RANGE, low: 724, high: 752 }}
        footer={FOOTER}
        testID="kit-score-card-plan"
      />
      <StateLabel>What-if result: standard, and Close a card with both warnings</StateLabel>
      <WhatIfResult variant="standard" range="724–752" direction="improves" />
      <WhatIfResult variant="closeCard" range="676–704" direction="lowers" />
      <StateLabel>What-if tiles: the first is suggested</StateLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.grid }}>
        {WHAT_IFS.map((item, index) => (
          <View key={item.label} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <WhatIfTile
              icon={
                <Text variant="numS" color={item.suggested ? 'link' : 'muted'}>
                  {item.glyph}
                </Text>
              }
              label={item.label}
              suggested={item.suggested}
              onPress={noop}
              testID={`kit-what-if-${index}`}
            />
          </View>
        ))}
      </View>
    </Section>
  );
}
