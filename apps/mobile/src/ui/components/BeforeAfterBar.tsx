import { useState } from 'react';
import { View } from 'react-native';
import { clampPercent, percentStyle } from '../primitives/percent';
import { Text } from '../primitives/Text';
import { color } from '../theme';

export type BeforeAfterBarProps = {
  beforePercent: number;
  afterPercent: number;
  /** Already formatted, for example `19.5% → 18.7%` (engine `formatBeforeAfter`). */
  label: string;
  testID?: string;
};

const BAR_HEIGHT = 10;
const STRIPE_WIDTH = 2;
const STRIPE_GAP = 2;
const PITCH = STRIPE_WIDTH + STRIPE_GAP;
// A 45 degree stripe leans this far past its own left edge across the bar height.
const LEAN = BAR_HEIGHT * 0.6;

/**
 * Before/after bar (design.md 6.8). The accent fill is "after"; the part the plan removes is a
 * diagonal muted hatch with a 2px gap, never a second solid colour. No SVG: thin rotated stripes
 * clipped by `overflow: hidden`. The whole bar is one `image` with a sentence label.
 * Fills are drawn at their final width (no animation), which is also what reduce motion asks for.
 */
export function BeforeAfterBar({
  beforePercent,
  afterPercent,
  label,
  testID = 'before-after-bar',
}: BeforeAfterBarProps) {
  const [removedPx, setRemovedPx] = useState(0);
  const after = clampPercent(afterPercent);
  const removed = Math.max(0, clampPercent(beforePercent) - after);
  const stripeCount = removed > 0 && removedPx > 0 ? Math.ceil((removedPx + 2 * LEAN) / PITCH) : 0;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Utilization ${label}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}
    >
      <View
        testID={`${testID}-track`}
        style={{
          flexGrow: 1,
          flexBasis: 120,
          height: BAR_HEIGHT,
          backgroundColor: color.hairline,
        }}
      >
        <View
          testID={`${testID}-fill`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: percentStyle(after),
            backgroundColor: color.accent,
          }}
        />
        <View
          testID={`${testID}-removed`}
          onLayout={(event) => setRemovedPx(event.nativeEvent.layout.width)}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: percentStyle(after),
            width: percentStyle(removed),
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: stripeCount }, (_, i) => (
            <View
              key={i}
              testID={`${testID}-stripe`}
              style={{
                position: 'absolute',
                top: -BAR_HEIGHT / 2,
                left: i * PITCH - LEAN,
                width: STRIPE_WIDTH,
                height: BAR_HEIGHT * 2,
                backgroundColor: color.muted,
                transform: [{ rotate: '45deg' }],
              }}
            />
          ))}
        </View>
      </View>
      <Text
        variant="caption"
        color="body"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ flexShrink: 0 }}
      >
        {label}
      </Text>
    </View>
  );
}
