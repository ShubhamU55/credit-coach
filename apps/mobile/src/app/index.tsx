import { utilization } from '@credit-coach/engine';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { StubScreen, stubTarget } from '../shell/StubScreen';
import { useDemoRepository } from '../state/DemoRepositoryContext';

// Stub: PD-8 replaces this body with the real Welcome screen. Keep the route file name and
// the `welcome-screen` and `welcome-try-sample` testIDs (the Maestro flows use them).
export default function WelcomeRoute() {
  const repository = useDemoRepository();

  function trySampleProfile() {
    repository.reset();
    // replace, not push: Android back from Home must not return to Welcome.
    router.replace('/home');
  }

  return (
    <StubScreen title="Credit Coach" testID="welcome-screen">
      <Text>Welcome</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try sample profile"
        testID="welcome-try-sample"
        style={stubTarget}
        hitSlop={8}
        onPress={trySampleProfile}
      >
        <Text>Try sample profile</Text>
      </Pressable>
      {/* Smoke-flow check that the engine package resolves in the bundle. */}
      <Text testID="engine-check">Engine OK: {utilization(4500, 15000)}%</Text>
    </StubScreen>
  );
}
