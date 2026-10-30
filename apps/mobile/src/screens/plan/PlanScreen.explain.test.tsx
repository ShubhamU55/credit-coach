import { render, screen } from '@testing-library/react-native';

import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { useExplanation } from '../../explain';
import { PlanScreen } from './PlanScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));
jest.mock('../../explain', () => {
  const actual = jest.requireActual('../../explain');
  return { ...actual, useExplanation: jest.fn(actual.useExplanation) };
});

const mockHook = useExplanation as jest.MockedFunction<typeof useExplanation>;
const actualHook =
  jest.requireActual<typeof import('../../explain')>('../../explain').useExplanation;

async function renderPlan() {
  await render(
    <DemoRepositoryProvider repository={createDemoRepository()}>
      <PlanScreen />
    </DemoRepositoryProvider>,
  );
}

beforeEach(() => {
  mockHook.mockReset();
  mockHook.mockImplementation(actualHook);
});

describe('PlanScreen "Why this plan?"', () => {
  it('shows the engine template, unlabelled as AI, when there is no backend', async () => {
    await renderPlan();

    expect(screen.getByText('WHY THIS PLAN')).toBeOnTheScreen();
    expect(screen.queryByText(/AI-WRITTEN/)).toBeNull();
    expect(screen.getByTestId('ai-explanation')).toHaveTextContent(/Overall utilization goes from/);
  });

  it('keeps the template when the hook falls back after a client failure', async () => {
    mockHook.mockReturnValue({ text: 'ignored template', aiWritten: false, loading: false });

    await renderPlan();

    expect(screen.getByTestId('ai-explanation')).toHaveTextContent(/Overall utilization goes from/);
    expect(screen.queryByText('ignored template')).toBeNull();
    expect(screen.queryByText(/AI-WRITTEN/)).toBeNull();
  });

  it('shows the AI sentence with the AI label when the hook returns AI text', async () => {
    mockHook.mockReturnValue({
      text: 'Pay Axis first to stay on time.',
      aiWritten: true,
      loading: false,
    });

    await renderPlan();

    expect(screen.getByText('✦ WHY THIS PLAN · AI-WRITTEN')).toBeOnTheScreen();
    expect(screen.getByText('Pay Axis first to stay on time.')).toBeOnTheScreen();
    expect(screen.queryByText(/Overall utilization goes from/)).toBeNull();
  });

  it('builds the payload from the plan the screen displays', async () => {
    await renderPlan();

    const [plan, cards, context] = mockHook.mock.calls[mockHook.mock.calls.length - 1];
    expect(plan.items).toHaveLength(5);
    expect(plan.items.some((i) => i.amount === 11780)).toBe(true);
    expect(screen.getByTestId('plan-step-3')).toHaveTextContent(/₹11,780/);
    expect(cards.length).toBeGreaterThan(0);
    expect(context.today).toBe('2026-10-21');
    expect(context.rules.aimFor10).toBe(false);
  });

  it('keeps the testIDs the flows use when the AI text swaps in', async () => {
    mockHook.mockReturnValue({ text: 'Pay Axis first.', aiWritten: true, loading: false });

    await renderPlan();

    for (const id of ['ai-explanation', 'plan-step-3', 'plan-leftover', 'plan-aim-switch']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });
});
