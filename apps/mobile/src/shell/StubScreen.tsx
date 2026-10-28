import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

interface StubScreenProps {
  /** Screen name shown as the heading. */
  title: string;
  /** Root testID, kebab-case and screen-prefixed (for example `home-screen`). */
  testID: string;
  /** Safe-area edges to pad. Sheets pass `['bottom']`; full screens keep the default. */
  edges?: readonly Edge[];
  children?: ReactNode;
}

/**
 * Placeholder body for a route that the screen streams (PD-8 to PD-10) will replace.
 * Routes keep their testID when the real screen lands.
 */
export function StubScreen({ title, testID, edges, children }: StubScreenProps) {
  return (
    <SafeAreaView style={styles.safe} testID={testID} edges={edges}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Minimum touch target (docs/design.md section 10): 48dp tall, label centred. */
export const stubTarget = { minHeight: 48, justifyContent: 'center' } as const;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
});
