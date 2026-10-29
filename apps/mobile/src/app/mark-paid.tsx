import { useLocalSearchParams } from 'expo-router';

import { MarkPaidSheet } from '../screens/plan';

// Params can come from a deep link, so they are untrusted: the sheet validates them and never
// records a payment until the user taps Confirm.
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function MarkPaidRoute() {
  const params = useLocalSearchParams<{ cardId?: string; amount?: string }>();
  return <MarkPaidSheet cardId={first(params.cardId)} amount={first(params.amount)} />;
}
