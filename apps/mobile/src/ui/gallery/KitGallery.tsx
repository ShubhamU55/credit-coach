import { utilization } from '@credit-coach/engine';
import { Screen } from '../components/Screen';
import { Text } from '../primitives/Text';
import { ButtonsSection } from './ButtonsSection';
import { CardsSection } from './CardsSection';
import { ChromeSection } from './ChromeSection';
import { FormSection } from './FormSection';
import { InfoSection } from './InfoSection';
import { PlanSection } from './PlanSection';
import { ScoreSection } from './ScoreSection';

/**
 * Every kit component in every state, one section per component group, with the Aarav fixture
 * from docs/design.md section 8. Maestro scrolls to each `kit-<section>` and takes a screenshot
 * for the visual review (apps/mobile/.maestro/kit-gallery.yaml). Plan 4b moves this to a `/kit`
 * route. "Credit Coach" and `engine-check` stay at the top so smoke.yaml is unchanged.
 */
export function KitGallery() {
  return (
    <Screen scroll>
      <Text variant="h1">Credit Coach</Text>
      <Text variant="body" testID="engine-check">
        {`Engine OK: ${utilization(4500, 15000)}%`}
      </Text>
      <ButtonsSection />
      <FormSection />
      <InfoSection />
      <CardsSection />
      <PlanSection />
      <ScoreSection />
      <ChromeSection />
    </Screen>
  );
}
