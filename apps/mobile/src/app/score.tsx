import { Link } from 'expo-router';

import { StubScreen, stubTarget } from '../shell/StubScreen';

// Stub: PD-10 replaces this body with the real Score screen; keep the `score-screen` testID.
export default function ScoreRoute() {
  return (
    <StubScreen title="Score" testID="score-screen">
      <Link href="/home" testID="score-link-home" style={stubTarget}>
        Back to Home
      </Link>
    </StubScreen>
  );
}
