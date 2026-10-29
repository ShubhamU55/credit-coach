import { useLocalSearchParams } from 'expo-router';

import { MarkPaidSheet } from '../screens/plan';

// Params can come from a deep link, so they are untrusted: the sheet validates them and never
// records a payment until the user taps Confirm. An array param (?cardId=a&cardId=b) uses its
// first value.
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function MarkPaidRoute() {
  const params = useLocalSearchParams<{
    cardId?: string;
    amount?: string;
    aim10?: string;
    cash?: string;
  }>();
  return (
    <MarkPaidSheet
      cardId={first(params.cardId)}
      amount={first(params.amount)}
      aim10={first(params.aim10)}
      cash={first(params.cash)}
    />
  );
}
