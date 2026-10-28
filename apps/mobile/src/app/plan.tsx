import { Link } from 'expo-router';

import { StubScreen, stubTarget } from '../shell/StubScreen';

// Stub: PD-9 replaces this body with the real Plan screen; keep the `plan-screen` testID.
export default function PlanRoute() {
  return (
    <StubScreen title="Plan" testID="plan-screen">
      <Link href="/mark-paid" testID="plan-link-mark-paid" style={stubTarget}>
        Open Mark as paid
      </Link>
      <Link href="/home" testID="plan-link-home" style={stubTarget}>
        Back to Home
      </Link>
    </StubScreen>
  );
}
