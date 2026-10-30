import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { MarkPaidSheet } from './MarkPaidSheet';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));

const BASE_PAD = 28;

async function renderWithBottomInset(bottom: number | null, props: { cardId?: string } = {}) {
  const sheet = (
    <DemoRepositoryProvider repository={createDemoRepository()}>
      <MarkPaidSheet {...props} />
    </DemoRepositoryProvider>
  );
  await render(
    bottom === null ? (
      sheet
    ) : (
      <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom }}>
        {sheet}
      </SafeAreaInsetsContext.Provider>
    ),
  );
}

function bottomPad(testID: string): number | string | undefined {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style).paddingBottom;
}

describe('MarkPaidSheet bottom inset (3-button navigation)', () => {
  it('pads the form by the system navigation bar so Confirm stays clear of it', async () => {
    await renderWithBottomInset(48);
    expect(bottomPad('mark-paid-sheet')).toBe(BASE_PAD + 48);
  });

  it('pads the Done state by the inset', async () => {
    await renderWithBottomInset(48);
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    expect(bottomPad('mark-paid-done')).toBe(BASE_PAD + 48);
  });

  it('pads the invalid state by the inset', async () => {
    await renderWithBottomInset(48, { cardId: 'no-such-card' });
    expect(bottomPad('mark-paid-invalid')).toBe(BASE_PAD + 48);
  });

  it("keeps today's layout when the inset is 0 (gesture navigation)", async () => {
    await renderWithBottomInset(0);
    expect(bottomPad('mark-paid-sheet')).toBe(BASE_PAD);
  });

  it("keeps today's layout when no safe-area provider exists", async () => {
    await renderWithBottomInset(null);
    expect(bottomPad('mark-paid-sheet')).toBe(BASE_PAD);
  });

  it('scrolls, so the actions stay reachable on the 0.6 detent', async () => {
    await renderWithBottomInset(48);
    expect(screen.getByTestId('mark-paid-scroll')).toBeTruthy();
  });
});
