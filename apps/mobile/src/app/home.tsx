import { Link } from 'expo-router';
import { Text } from 'react-native';

import { StubScreen, stubTarget } from '../shell/StubScreen';
import { useCards, useProfile } from '../state/DemoRepositoryContext';

// Stub: PD-8 replaces this body with the real Home screen; keep the `home-screen` testID.
export default function HomeRoute() {
  const profile = useProfile();
  const axis = useCards().find((card) => card.id === 'axis-neo');

  return (
    <StubScreen title="Home" testID="home-screen">
      <Text testID="home-greeting">{profile.name}</Text>
      <Text testID="home-axis-outstanding">Axis Neo outstanding: {axis?.outstanding}</Text>
      <Link href="/plan" testID="home-link-plan" style={stubTarget}>
        Go to Plan
      </Link>
      <Link href="/score" testID="home-link-score" style={stubTarget}>
        Go to Score
      </Link>
      <Link href="/mark-paid" testID="home-link-mark-paid" style={stubTarget}>
        Open Mark as paid
      </Link>
    </StubScreen>
  );
}
