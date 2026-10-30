import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BackendBootstrap } from '../backend/BackendBootstrap';
import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';
import { MARK_PAID_SHEET_OPTIONS } from '../screens/plan/markPaidSheetOptions';

export default function RootLayout() {
  return (
    <DemoRepositoryProvider>
      <BackendBootstrap />
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="score" />
        <Stack.Screen name="mark-paid" options={MARK_PAID_SHEET_OPTIONS} />
      </Stack>
    </DemoRepositoryProvider>
  );
}
