import { View } from 'react-native';
import { clampPercent, percentStyle } from '../primitives/percent';
import { Text } from '../primitives/Text';
import { color } from '../theme';
import { kitShadow } from '../theme/kitB';

export type TimelineLane = {
  cardName: string;
  /** The pay-by date and its label, for example `₹12,400 · 22 Oct`. */
  payBy?: { iso: string; label: string };
  /** ISO due date. A lane with no due date draws no Due marker (design.md 8, SBI). */
  due?: string;
  /** ISO statement (reporting) date. */
  statement?: string;
};

export type PaymentTimelineStripProps = {
  /** ISO date of "today". Passed in, never read from the clock. */
  todayIso: string;
  lanes: TimelineLane[];
  /** One full sentence per card, dynamic (it changes with the 10% switch). */
  a11yLabel: string;
};

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const INSET = 8; // keeps a marker on day 0 or day 30 inside the strip
const TRACK_HEIGHT = 52;
const LINE_TOP = 40;
const PAY_SIZE = 14;
const DOT_SIZE = 10;
const LABEL_SIDE_SWITCH = 60; // past this percent the pay label hangs to the left of its marker

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDay(iso: string): number | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** Percent along the 30-day window (today = 0, today + 30 = 100), or null when outside it. */
export function windowPercent(todayIso: string, iso: string | undefined): number | null {
  const today = utcDay(todayIso);
  const day = iso === undefined ? null : utcDay(iso);
  if (today === null || day === null) return null;
  const offset = day - today;
  if (offset < 0 || offset > WINDOW_DAYS) return null;
  return clampPercent((offset / WINDOW_DAYS) * 100);
}

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function Lane({ lane, todayIso, index }: { lane: TimelineLane; todayIso: string; index: number }) {
  const pay = windowPercent(todayIso, lane.payBy?.iso);
  const due = windowPercent(todayIso, lane.due);
  const statement = windowPercent(todayIso, lane.statement);
  return (
    <View testID={`timeline-lane-${index}`}>
      <Text variant="caption" color="ink" style={{ marginLeft: INSET }}>
        {lane.cardName}
      </Text>
      <View style={{ height: TRACK_HEIGHT, marginHorizontal: INSET }}>
        <View
          {...hidden}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: LINE_TOP,
            height: 1,
            backgroundColor: color.rule,
          }}
        />
        {pay !== null && lane.payBy ? (
          <>
            <View
              testID="pay-marker"
              {...hidden}
              style={{
                position: 'absolute',
                left: percentStyle(pay),
                marginLeft: -PAY_SIZE / 2,
                top: LINE_TOP - PAY_SIZE - 4,
                width: PAY_SIZE,
                height: PAY_SIZE,
                backgroundColor: color.accent,
                boxShadow: kitShadow.timelinePay,
              }}
            />
            <Text
              variant="micro"
              color="link"
              numberOfLines={1}
              style={{
                position: 'absolute',
                top: 0,
                ...(pay > LABEL_SIDE_SWITCH
                  ? { right: percentStyle(100 - pay) }
                  : { left: percentStyle(pay) }),
              }}
            >
              {lane.payBy.label}
            </Text>
          </>
        ) : null}
        {due !== null ? (
          <View
            testID="due-marker"
            {...hidden}
            style={{
              position: 'absolute',
              left: percentStyle(due),
              marginLeft: -DOT_SIZE / 2,
              top: LINE_TOP + 0.5 - DOT_SIZE / 2,
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: DOT_SIZE / 2,
              backgroundColor: color.ink,
            }}
          />
        ) : null}
        {statement !== null ? (
          <View
            testID="statement-marker"
            {...hidden}
            style={{
              position: 'absolute',
              left: percentStyle(statement),
              marginLeft: -DOT_SIZE / 2,
              top: LINE_TOP + 0.5 - DOT_SIZE / 2,
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderWidth: 1,
              borderColor: color.ink,
              transform: [{ rotate: '45deg' }],
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function Legend() {
  return (
    <View
      {...hidden}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: DOT_SIZE, height: DOT_SIZE, backgroundColor: color.accent }} />
        <Text variant="caption">You pay</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
            backgroundColor: color.ink,
          }}
        />
        <Text variant="caption">Due</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: DOT_SIZE - 2,
            height: DOT_SIZE - 2,
            borderWidth: 1,
            borderColor: color.ink,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <Text variant="caption">Statement (reported)</Text>
      </View>
    </View>
  );
}

/**
 * Payment timeline strip (design.md 6.9): one lane per card over the next 30 days. The whole strip
 * is a single `image` with a sentence label. A date outside the window is not drawn (the label
 * still says it). A lane without a due date draws no Due marker.
 */
export function PaymentTimelineStrip({ todayIso, lanes, a11yLabel }: PaymentTimelineStripProps) {
  return (
    <View
      testID="payment-timeline-strip"
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
      style={{ gap: 12 }}
    >
      <View style={{ gap: 8 }}>
        {lanes.map((lane, index) => (
          <Lane key={lane.cardName} lane={lane} todayIso={todayIso} index={index} />
        ))}
        <View
          testID="timeline-today"
          {...hidden}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: INSET,
            width: 1,
            backgroundColor: color.accent,
          }}
        />
      </View>
      <Legend />
    </View>
  );
}
