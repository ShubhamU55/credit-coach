import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { space } from '../theme';

export type SectionProps = {
  /** Becomes the testID `kit-<id>` that the Maestro flow scrolls to. */
  id: string;
  title: string;
  children: ReactNode;
};

/** One gallery section: an overline title and the component in every state. */
export function Section({ id, title, children }: SectionProps) {
  return (
    <View testID={`kit-${id}`} collapsable={false} style={{ gap: space.cardPad }}>
      <Text variant="overline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A small caption naming the state shown beneath it. */
export function StateLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" color="muted">
      {children}
    </Text>
  );
}
