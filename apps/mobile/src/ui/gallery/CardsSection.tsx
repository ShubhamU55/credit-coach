import { ScrollView } from 'react-native';
import { CardTile } from '../components/CardTile';
import { HeroPaymentCard } from '../components/HeroPaymentCard';
import { Text } from '../primitives/Text';
import { fontFamily, space } from '../theme';
import { CARDS, HERO, THRESHOLD } from './fixtures';
import { Section, StateLabel } from './Section';

const noop = () => {};

export function CardsSection() {
  return (
    <Section id="cards" title="Card surfaces">
      <StateLabel>Hero payment card, 2 of 5 steps done</StateLabel>
      <HeroPaymentCard
        {...HERO}
        sentence={
          <>
            {'By '}
            <Text variant="body" style={{ fontFamily: fontFamily.sans700 }}>
              Thu, 22 Oct
            </Text>
            {' — clears your full statement, so zero interest.'}
          </>
        }
        onMarkPaid={noop}
        onViewPlan={noop}
      />
      <StateLabel>Card tiles: the carousel bleeds to the screen edge</StateLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.gutter }}
        contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.carousel }}
      >
        {CARDS.map((card) => (
          <CardTile
            key={card.name}
            name={card.name}
            finish={card.finish}
            utilPercent={card.utilPercent}
            threshold={THRESHOLD}
            line={card.line}
            onPress={noop}
            testID={`kit-card-${card.finish}`}
          />
        ))}
      </ScrollView>
    </Section>
  );
}
