import { View } from 'react-native';
import { DashedRule } from '../primitives/DashedRule';
import { percentStyle } from '../primitives/percent';
import { Text } from '../primitives/Text';
import { color, scoreZone, space } from '../theme';
import { kitShadow } from '../theme/kitB';
import { ScoreRangeText } from './ScoreRangeText';

export type ScoreZoneSpec = { name: string; from: number; to: number };

export type ScoreCardProps = {
  /** Already formatted by `formatScoreRange`, for example `708–736`. */
  range: string;
  /** Zone cut points come from engine config (admin-editable). Nothing here is hard-coded. */
  zones: ScoreZoneSpec[];
  currentZone: string;
  nowLow: number;
  nowHigh: number;
  withPlan?: { range: string; low: number; high: number };
  footer: string;
  testID?: string;
};

const BAR_HEIGHT = 14;
const NOW_HEIGHT = 24;
const GAP = 3;
const ZONE_KEYS = ['poor', 'fair', 'good', 'excellent'] as const;

/** Zone colour by name (Poor, Fair, Good, Excellent); an unknown name falls back to its position. */
function zoneColor(name: string, index: number): string {
  const byName = ZONE_KEYS.find((key) => key === name.trim().toLowerCase());
  return scoreZone[byName ?? ZONE_KEYS[Math.min(index, ZONE_KEYS.length - 1)]];
}

type Scale = { min: number; span: number };

function scaleOf(zones: ScoreZoneSpec[]): Scale {
  if (zones.length === 0) return { min: 0, span: 0 };
  const min = Math.min(...zones.map((z) => z.from));
  const max = Math.max(...zones.map((z) => z.to));
  return { min, span: max - min };
}

/** Left and width, as percentages of the scale, for a low..high block. */
function blockPlacement(scale: Scale, low: number, high: number) {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return {
    left: percentStyle(((lo - scale.min) / scale.span) * 100),
    width: percentStyle(
      ((Math.min(hi, scale.min + scale.span) - Math.max(lo, scale.min)) / scale.span) * 100,
    ),
  };
}

function sentence(props: ScoreCardProps): string {
  const { range, zones, currentZone, withPlan } = props;
  const spans = zones.map((z) => `${z.name} ${z.from} to ${z.to}`).join(', ');
  return [
    `Estimated score ${range}, in the ${currentZone} zone.`,
    zones.length > 0 ? `Zones: ${spans}.` : null,
    withPlan ? `With the plan, ${withPlan.range}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function ZoneBar({ props, scale }: { props: ScoreCardProps; scale: Scale }) {
  const { zones, currentZone, nowLow, nowHigh } = props;
  return (
    <View>
      <View style={{ marginVertical: (NOW_HEIGHT - BAR_HEIGHT) / 2 }}>
        <View style={{ flexDirection: 'row', height: BAR_HEIGHT }}>
          {zones.map((zone, i) => (
            <View
              key={zone.name}
              testID={`score-zone-${i}`}
              style={{
                flex: Math.max(0, zone.to - zone.from),
                height: BAR_HEIGHT,
                marginLeft: i === 0 ? 0 : GAP,
                backgroundColor: zoneColor(zone.name, i),
              }}
            />
          ))}
        </View>
        {scale.span > 0 ? (
          <View
            testID="score-now"
            style={{
              position: 'absolute',
              top: -(NOW_HEIGHT - BAR_HEIGHT) / 2,
              height: NOW_HEIGHT,
              minWidth: 6,
              backgroundColor: color.ink,
              boxShadow: kitShadow.scoreNow,
              ...blockPlacement(scale, nowLow, nowHigh),
            }}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
        {zones.map((zone) => (
          <Text key={zone.name} variant="micro" color={zone.name === currentZone ? 'ink' : 'muted'}>
            {zone.name}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PlanLane({
  plan,
  scale,
}: {
  plan: NonNullable<ScoreCardProps['withPlan']>;
  scale: Scale;
}) {
  return (
    <View style={{ gap: 12 }}>
      <DashedRule color={color.rule} testID="score-card-rule" />
      <View testID="score-card-plan" style={{ gap: 8 }}>
        <View style={{ height: BAR_HEIGHT, backgroundColor: color.hairline }}>
          {scale.span > 0 ? (
            <View
              testID="score-plan-block"
              style={{
                position: 'absolute',
                top: 0,
                height: BAR_HEIGHT,
                minWidth: 6,
                backgroundColor: color.accent,
                ...blockPlacement(scale, plan.low, plan.high),
              }}
            />
          ) : null}
        </View>
        <Text
          variant="numXS"
          color="link"
          numberOfLines={1}
          testID="score-range-plan"
          style={{ flexShrink: 0 }}
        >
          {`With plan · ${plan.range}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * Score card (design.md 6.13): the range on one line next to the word *estimate*, a zone bar drawn
 * from props, and an optional with-plan lane on its own row below a dashed rule.
 * Never a single score and never a gauge.
 */
export function ScoreCard(props: ScoreCardProps) {
  const { range, zones, withPlan, footer, testID = 'score-card' } = props;
  const scale = scaleOf(zones);
  return (
    <View
      testID={testID}
      style={{
        padding: space.heroPad,
        gap: 16,
        borderWidth: 1,
        borderColor: color.hairline,
        backgroundColor: color.surface,
      }}
    >
      <View testID="score-card-main" style={{ gap: 8 }}>
        <Text variant="overline">ESTIMATED SCORE</Text>
        <ScoreRangeText range={range} size="XL" />
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}
        >
          <Text variant="estimateTag">estimate</Text>
          <Text variant="caption" color="muted">
            Not your official CIBIL score.
          </Text>
        </View>
      </View>
      <View
        testID="score-card-bar"
        accessible
        accessibilityRole="image"
        accessibilityLabel={sentence(props)}
        style={{ gap: 16 }}
      >
        <ZoneBar props={props} scale={scale} />
        {withPlan ? <PlanLane plan={withPlan} scale={scale} /> : null}
      </View>
      <Text variant="caption" color="muted">
        {footer}
      </Text>
    </View>
  );
}
