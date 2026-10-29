import { View } from 'react-native';
import { AIExplanation } from '../components/AIExplanation';
import { Disclaimer } from '../components/Disclaimer';
import { ReasonRow } from '../components/ReasonRow';
import { SampleStrip } from '../components/SampleStrip';
import { StatTile } from '../components/StatTile';
import { StatusChip } from '../components/StatusChip';
import { UtilizationLabel } from '../components/UtilizationLabel';
import { cardFinish, space } from '../theme';
import { AFTER_PLAN_UTIL, AI_TEXT, OVERALL_UTIL, SCORE_RANGE, THRESHOLD } from './fixtures';
import { Section, StateLabel } from './Section';

const noop = () => {};

export function InfoSection() {
  return (
    <Section id="info" title="Information blocks">
      <StateLabel>Status chips: due soon, neutral, on a finish (with dot)</StateLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatusChip variant="dueSoon" label="⚠ BY TOMORROW" testID="kit-chip-soon" />
        <StatusChip variant="neutral" label="BY WED, 4 NOV" testID="kit-chip-neutral" />
        <View style={{ backgroundColor: cardFinish.plum.fill, padding: 8 }}>
          <StatusChip variant="onFinish" dot label="BY THU, 22 OCT" testID="kit-chip-finish" />
        </View>
      </View>
      <StateLabel>Utilization label: over, at target</StateLabel>
      <UtilizationLabel percent={45} threshold={THRESHOLD} />
      <UtilizationLabel percent={30} threshold={THRESHOLD} />
      <StateLabel>Stat tiles: over threshold, and the score range</StateLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.grid }}>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <StatTile
            overline="UTILIZATION"
            value={OVERALL_UTIL}
            over
            barPercent={45}
            targetPercent={THRESHOLD}
            caption="⚠ over 30% target"
            delta={`↓ ${AFTER_PLAN_UTIL} after plan`}
            onPress={noop}
            testID="kit-stat-util"
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <StatTile
            overline="EST. SCORE"
            value={SCORE_RANGE}
            barPercent={68}
            targetPercent={70}
            caption="estimate · Good"
            delta="↑ 724–752 with plan"
            onPress={noop}
            testID="kit-stat-score"
          />
        </View>
      </View>
      <StateLabel>Reason rows: lowers, improves</StateLabel>
      <ReasonRow title="Highest card at 81%" direction="lowers" caption="biggest drag" />
      <ReasonRow title="36 months with zero missed" direction="improves" caption="steady record" />
      <StateLabel>AI explanation: AI-written, template fallback</StateLabel>
      <AIExplanation text={AI_TEXT} aiWritten />
      <AIExplanation text={AI_TEXT} aiWritten={false} />
      <StateLabel>Sample strip</StateLabel>
      <SampleStrip onSwitch={noop} />
      <StateLabel>Disclaimer (fixed copy)</StateLabel>
      <Disclaimer />
    </Section>
  );
}
