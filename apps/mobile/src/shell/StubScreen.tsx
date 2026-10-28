import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface StubScreenProps {
  /** Screen name shown as the heading. */
  title: string;
  /** Root testID, kebab-case and screen-prefixed (for example `home-screen`). */
  testID: string;
  children?: ReactNode;
}

/**
 * Placeholder body for a route that the screen streams (PD-8 to PD-10) will replace.
 * Routes keep their testID when the real screen lands.
 */
export function StubScreen({ title, testID, children }: StubScreenProps) {
  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
});
