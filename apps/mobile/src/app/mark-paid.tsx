import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { DEMO_TODAY } from '../demo/config';
import { RepositoryError } from '../demo/types';
import { StubScreen, stubTarget } from '../shell/StubScreen';
import { useDemoRepository } from '../state/DemoRepositoryContext';

// Stub bottom sheet: PD-9 replaces this body with the real Mark as paid sheet; keep the
// `mark-paid-screen` testID. The first button only proves the repository is wired through
// context (Axis Neo minimum, 620, per docs/design.md section 8).
//
// PD-9 must NOT copy an unguarded recordPayment: it throws a RepositoryError (unknown card,
// bad or too-large amount, bad date), so catch it and show the message. A deep link such as
// creditcoach://mark-paid must never record a payment on open: only the explicit button below
// does, and this stub reads no route params. If PD-9 adds params (card id, amount), validate
// them against the repository before prefilling and still require the user to confirm.
export default function MarkPaidRoute() {
  const repository = useDemoRepository();
  const [error, setError] = useState<string | null>(null);

  function recordAxisMinimum() {
    try {
      repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    } catch (caught) {
      if (caught instanceof RepositoryError) {
        setError(caught.message);
        return;
      }
      throw caught;
    }
    setError(null);
    router.back();
  }

  return (
    <StubScreen title="Mark as paid" testID="mark-paid-screen" edges={['bottom']}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record Axis Neo minimum"
        testID="mark-paid-record-axis-minimum"
        style={stubTarget}
        hitSlop={8}
        onPress={recordAxisMinimum}
      >
        <Text>Record Axis Neo minimum (620)</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" testID="mark-paid-error">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID="mark-paid-close"
        style={stubTarget}
        hitSlop={8}
        onPress={() => router.back()}
      >
        <Text>Close</Text>
      </Pressable>
    </StubScreen>
  );
}
