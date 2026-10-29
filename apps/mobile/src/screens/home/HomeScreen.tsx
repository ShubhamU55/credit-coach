import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { DEMO_TODAY } from '../../demo/config';
import { useCards, usePayments, useProfile, useRules } from '../../state/DemoRepositoryContext';
import {
  CardTile,
  DateBlockTimeline,
  FloatingNav,
  HeroPaymentCard,
  Screen,
  StatTile,
  Text,
  TextAction,
  color,
  fontFamily,
  space,
  type NavTab,
} from '../../ui';
import { NO_ESTIMATE_TEXT, buildHomeModel, type HeroModel } from './adapter';
import { Italic, STACK_FONT_SCALE } from '../shared/headline';
import { HomeHeader } from './HomeHeader';

export const CARDS_UNAVAILABLE = 'The Cards screen is not available yet.';

const bold = { fontFamily: fontFamily.sans800 } as const;

function HeroSentence({ hero }: { hero: HeroModel }) {
  return (
    <>
      {hero.dateUnknown ? null : 'By '}
      <Text variant="body" color="ink" style={bold}>
        {hero.dateText}
      </Text>
      {hero.middleText}
      {hero.emphasisText ? (
        <Text variant="body" color="ink" style={bold}>
          {hero.emphasisText}
        </Text>
      ) : null}
    </>
  );
}

function excludedNote(names: readonly string[]): string {
  const verb = names.length === 1 ? 'has' : 'have';
  return `${names.join(' and ')} ${verb} no credit limit on file, so ${
    names.length === 1 ? 'it is' : 'they are'
  } left out of your utilization.`;
}

/**
 * Home (design.md 7.2): header and sample strip, headline, the hero payment, two stat tiles, the
 * card carousel, "Coming up", the disclaimer and the floating nav. Every figure is computed by the
 * engine in `buildHomeModel` from the repository data and the fixed demo "today".
 */
export function HomeScreen() {
  const profile = useProfile();
  const cards = useCards();
  const rules = useRules();
  const payments = usePayments();
  const model = useMemo(
    () => buildHomeModel({ profile, cards, rules, payments, today: DEMO_TODAY }),
    [profile, cards, rules, payments],
  );

  const [cardsNotice, setCardsNotice] = useState(false);
  const stackTiles = useWindowDimensions().fontScale > STACK_FONT_SCALE;
  const openPlan = () => router.push('/plan');
  const openScore = () => router.push('/score');
  const navigate = (tab: NavTab) => {
    // Home is already open. The Cards tab has no screen yet, so say so instead of staying silent.
    if (tab === 'plan') openPlan();
    if (tab === 'score') openScore();
    if (tab === 'cards') setCardsNotice(true);
  };

  const { score, utilTile } = model;
  const scoreDelta = score?.withPlanRange ? `↑ ${score.withPlanRange} with plan` : undefined;

  return (
    <View testID="home-screen" style={{ flex: 1 }}>
      <Screen scroll>
        <HomeHeader onSwitch={model.isSample ? () => router.replace('/') : undefined} />

        <Text variant="h1">
          {model.hero ? (
            <>
              {`${model.firstName}, one payment keeps you `}
              <Italic>on track.</Italic>
            </>
          ) : (
            <>
              {model.hasCards
                ? `${model.firstName}, you're all `
                : `${model.firstName}, add a card to `}
              <Italic>{model.hasCards ? 'set for now.' : 'get started.'}</Italic>
            </>
          )}
        </Text>

        {model.hero ? (
          <HeroPaymentCard
            finish={model.hero.finish}
            cardName={model.hero.cardName}
            dueChip={model.hero.dueChip}
            amount={model.hero.amount}
            sentence={<HeroSentence hero={model.hero} />}
            minimumLine={model.hero.minimumLine}
            stepsDone={model.stepsDone}
            stepsTotal={model.stepsTotal}
            onMarkPaid={() => router.push('/mark-paid')}
            onViewPlan={openPlan}
          />
        ) : (
          <Text variant="body" testID="home-nothing-to-do">
            {model.nothingToDo}
          </Text>
        )}

        <View
          testID="home-stat-row"
          style={{ flexDirection: stackTiles ? 'column' : 'row', gap: space.grid }}
        >
          <View style={{ flex: stackTiles ? undefined : 1 }}>
            <StatTile
              testID="home-stat-utilization"
              overline="UTILIZATION"
              value={utilTile.value}
              over={utilTile.over}
              barPercent={model.overall?.pct ?? 0}
              targetPercent={model.threshold}
              caption={utilTile.caption}
              delta={utilTile.delta}
              onPress={openPlan}
            />
          </View>
          <View style={{ flex: stackTiles ? undefined : 1 }}>
            {score ? (
              <StatTile
                testID="home-stat-score"
                overline="EST. SCORE"
                value={score.range}
                barPercent={score.barPercent}
                targetPercent={score.targetPercent}
                caption={`estimate · ${score.band}`}
                delta={scoreDelta}
                onPress={openScore}
              />
            ) : (
              <View
                testID="home-score-empty"
                style={{
                  padding: space.cardPad,
                  gap: 6,
                  borderWidth: 1,
                  borderColor: color.hairline,
                  backgroundColor: color.surface,
                }}
              >
                <Text variant="overline">EST. SCORE</Text>
                <Text variant="bodyS">{NO_ESTIMATE_TEXT}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ gap: space.grid }}>
          {model.hasCards ? (
            <Text variant="overline" accessibilityRole="header">
              {`YOUR CARDS · ${model.cards.length}`}
            </Text>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="home-card-carousel"
            style={{ marginHorizontal: -space.gutter }}
            contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.carousel }}
          >
            {model.cards.map((card) => (
              <CardTile
                key={card.id}
                testID={`home-card-${card.id}`}
                name={card.name}
                finish={card.finish}
                utilPercent={card.utilPercent}
                threshold={model.threshold}
                line={card.line}
              />
            ))}
          </ScrollView>
          {model.excluded.length > 0 ? (
            <Text variant="caption" testID="home-excluded-note">
              {excludedNote(model.excluded.map((card) => card.name))}
            </Text>
          ) : null}
        </View>

        {model.comingUp.length > 0 ? (
          <View style={{ gap: space.grid }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="overline" accessibilityRole="header">
                COMING UP
              </Text>
              <TextAction
                label={`All ${model.planItemCount} steps`}
                onPress={openPlan}
                testID="home-all-steps"
              />
            </View>
            <DateBlockTimeline items={model.comingUp} onPressItem={openPlan} />
          </View>
        ) : null}
      </Screen>
      {cardsNotice ? (
        <View
          testID="home-cards-notice"
          accessibilityRole="alert"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 100,
            padding: space.cardPad,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.lineStrong,
          }}
        >
          <Text variant="bodyS">{CARDS_UNAVAILABLE}</Text>
        </View>
      ) : null}
      <FloatingNav active="home" onNavigate={navigate} />
    </View>
  );
}
