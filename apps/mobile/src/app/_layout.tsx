import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';

export default function RootLayout() {
  return (
    <DemoRepositoryProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="score" />
        <Stack.Screen
          name="mark-paid"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1] }}
        />
      </Stack>
    </DemoRepositoryProvider>
  );
}
