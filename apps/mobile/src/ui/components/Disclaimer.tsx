import { Text } from '../primitives/Text';

/** Fixed copy, design.md section 1 rule 2. Never reword it. */
export const DISCLAIMER_TEXT =
  'Estimates only. Not your official CIBIL score. Not financial advice.';

/** Fixed copy, design.md section 1 rule 6: recording a payment is not paying it. */
export const RECORD_NOTE = 'This only records it here. Pay in your bank or UPI app.';

/** The disclaimer every screen that shows a score, utilization or a plan must end with. */
export function Disclaimer() {
  return (
    <Text variant="caption" color="muted" testID="disclaimer">
      {DISCLAIMER_TEXT}
    </Text>
  );
}
