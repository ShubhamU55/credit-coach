import { router } from 'expo-router';
import { useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { useDemoRepository } from '../../state/DemoRepositoryContext';
import { PopButton, Screen, Text, cardFinish, color, fontFamily, shadow, space } from '../../ui';

const STEPS = [
  { number: '01', label: 'Which card first' },
  { number: '02', label: 'How much, by when' },
  { number: '03', label: 'Your score, as a range' },
] as const;

const hidden = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Past this font scale the three steps stack, so their labels are never squeezed or clipped. */
const STACK_FONT_SCALE = 1.3;

const CARD_WIDTH = 220;
const CARD_HEIGHT = 136;

/** Back cards of the fan: graphite and navy, rotated behind the plum front card. */
const BACK_CARDS = [
  { finish: 'graphite', rotate: '-9deg', left: 10, top: 6 },
  { finish: 'navy', rotate: '-2deg', left: 30, top: 14 },
] as const;

/**
 * Decorative fan of three card finishes (design.md 7.1). The front card shows a sample payment
 * and bar; the whole stack is hidden from accessibility because it carries no information.
 */
function CardStack() {
  const front = cardFinish.plum;
  return (
    <View
      testID="welcome-card-stack"
      {...hidden}
      style={{ height: CARD_HEIGHT + 40, marginTop: 8 }}
    >
      {BACK_CARDS.map((card) => (
        <View
          key={card.finish}
          style={{
            position: 'absolute',
            left: card.left,
            top: card.top,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            borderWidth: 1,
            borderColor: cardFinish[card.finish].border,
            backgroundColor: cardFinish[card.finish].fill,
            transform: [{ rotate: card.rotate }],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 56,
          top: 22,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          padding: space.cardPad,
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: front.border,
          backgroundColor: front.fill,
          boxShadow: shadow.hero,
          transform: [{ rotate: '6deg' }],
        }}
      >
        <Text variant="micro" style={{ color: front.muted }}>
          AXIS NEO · BY THU
        </Text>
        <Text variant="numM">₹12,400</Text>
        <View style={{ height: 6, backgroundColor: front.track }}>
          <View style={{ width: '60%', height: 6, backgroundColor: color.accent }} />
        </View>
      </View>
    </View>
  );
}

/**
 * Welcome (design.md 7.1). "Try sample profile" is the one primary action: no sign-up, no typing.
 * It resets the in-memory sample data and replaces Welcome with Home, so Android back leaves the
 * app instead of returning here.
 */
export function WelcomeScreen() {
  const repository = useDemoRepository();

  const started = useRef(false);
  const stackSteps = useWindowDimensions().fontScale > STACK_FONT_SCALE;

  function trySampleProfile() {
    // A second tap while the first is navigating must not reset or navigate again.
    if (started.current) return;
    started.current = true;
    repository.reset();
    router.replace('/home');
  }

  return (
    <View testID="welcome-screen" style={{ flex: 1 }}>
      <Screen scroll>
        <View style={{ gap: space.grid, paddingTop: 24 }}>
          <Text variant="overline" color="ink">
            CREDIT COACH
          </Text>
          <CardStack />
          <Text variant="display">
            Know exactly what to pay, where, and{' '}
            <Text
              variant="display"
              accessibilityRole={undefined}
              style={{ fontFamily: fontFamily.serifItalic }}
            >
              when.
            </Text>
          </Text>
        </View>
        <View
          testID="welcome-steps"
          style={{ flexDirection: stackSteps ? 'column' : 'row', gap: space.grid }}
        >
          {STEPS.map((step) => (
            <View
              key={step.number}
              style={{
                flex: stackSteps ? undefined : 1,
                gap: 4,
                paddingTop: 8,
                borderTopWidth: 2,
                borderTopColor: color.ink,
              }}
            >
              <Text variant="micro" color="muted">
                {step.number}
              </Text>
              <Text variant="buttonS" style={{ textTransform: 'none' }}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ gap: space.grid }}>
          <PopButton
            label="Try sample profile"
            trailingArrow
            onPress={trySampleProfile}
            testID="welcome-try-sample"
          />
          <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
            No sign-up · 10 seconds
          </Text>
        </View>
      </Screen>
    </View>
  );
}
