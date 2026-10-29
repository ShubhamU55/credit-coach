import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { PlanScreen, initialsOf } from './PlanScreen';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
}));

const mockRouter = router as jest.Mocked<typeof router>;

async function renderPlan(repository = createDemoRepository()) {
  await render(
    <DemoRepositoryProvider repository={repository}>
      <PlanScreen />
    </DemoRepositoryProvider>,
  );
  return repository;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

it('passes the switch state and edited cash to Mark as paid', async () => {
  await renderPlan();
  await fireEvent.press(screen.getByTestId('plan-aim-switch'));
  await fireEvent.press(screen.getByTestId('plan-cash-edit'));
  await fireEvent.changeText(screen.getByTestId('plan-cash-input'), '90000');

  await fireEvent.press(screen.getByTestId('plan-step-1-mark-paid'));

  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/mark-paid',
    params: { cardId: 'axis-neo', aim10: '1', cash: '90000' },
  });
});

it('shows no Undo on a paid step', async () => {
  const repository = createDemoRepository();
  repository.recordPayment('axis-neo', 12400, DEMO_TODAY);
  await renderPlan(repository);

  expect(screen.queryByTestId('plan-step-3-undo')).toBeNull();
  expect(screen.queryByText('Undo')).toBeNull();
  expect(screen.getByTestId('plan-step-3')).toHaveTextContent(/✓ PAID · 21 OCT/);
});

it('lowers cash for cards and clears a shortfall once the minimum is recorded', async () => {
  const repository = await renderPlan();
  await fireEvent.press(screen.getByTestId('plan-cash-edit'));
  await fireEvent.changeText(screen.getByTestId('plan-cash-input'), '500');
  await fireEvent.press(screen.getByTestId('plan-cash-edit'));
  expect(screen.getByTestId('plan-shortfall-axis-neo')).toBeOnTheScreen();
  expect(screen.getByTestId('plan-cash')).toHaveTextContent('₹500');

  await act(async () => {
    repository.recordPayment('axis-neo', 620, DEMO_TODAY);
  });

  expect(screen.queryByTestId('plan-shortfall-axis-neo')).toBeNull();
  expect(screen.getByTestId('plan-cash')).toHaveTextContent('₹0');
});

it('draws initials for a non-Latin name and falls back when there are none', () => {
  expect(initialsOf('Aarav Mehta (sample)')).toBe('AM');
  expect(initialsOf('राहुल शर्मा')).toBe('रश');
  expect(initialsOf('')).toBe('?');
});
