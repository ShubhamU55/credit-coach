import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { DEMO_TODAY } from '../demo/config';
import { StubScreen } from '../shell/StubScreen';
import { useDemoRepository } from '../state/DemoRepositoryContext';

// Stub bottom sheet: PD-9 replaces this body with the real Mark as paid sheet; keep the
// `mark-paid-screen` testID. The first button only proves the repository is wired through
// context (Axis Neo minimum, 620, per docs/design.md section 8).
export default function MarkPaidRoute() {
  const repository = useDemoRepository();

  function recordAxisMinimum() {
    repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    router.back();
  }

  return (
    <StubScreen title="Mark as paid" testID="mark-paid-screen">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record Axis Neo minimum"
        testID="mark-paid-record-axis-minimum"
        onPress={recordAxisMinimum}
      >
        <Text>Record Axis Neo minimum (620)</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID="mark-paid-close"
        onPress={() => router.back()}
      >
        <Text>Close</Text>
      </Pressable>
    </StubScreen>
  );
}
