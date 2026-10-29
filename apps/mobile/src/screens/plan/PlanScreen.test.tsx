import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import aaravSeed from '../../demo/aarav.json';
import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { parseSeed } from '../../demo/seed';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { MarkPaidSheet } from './MarkPaidSheet';
import { PlanScreen } from './PlanScreen';

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

describe('PlanScreen (golden, design.md section 8)', () => {
  it('shows the 30% plan for Aarav with the switch off', async () => {
    await renderPlan();

    expect(screen.getByTestId('plan-period')).toHaveTextContent('21 OCT → 20 NOV');
    expect(screen.getByTestId('plan-cash')).toHaveTextContent('₹1,20,000');
    expect(screen.getByTestId('plan-util-before')).toHaveTextContent('45.0%');
    expect(screen.getByTestId('plan-util-after')).toHaveTextContent('15.3%');
    expect(screen.getByTestId('plan-highest')).toHaveTextContent('Highest card 81.0% → 30.0%');
    expect(screen.getByTestId('plan-leftover')).toHaveTextContent('₹31,000');
    expect(screen.getByTestId('plan-steps-heading')).toHaveTextContent('5 STEPS, IN ORDER');
    expect(screen.getByTestId('plan-step-3')).toHaveTextContent(/₹11,780/);
    expect(screen.getByTestId('plan-step-5')).toHaveTextContent(/₹2,400/);
    expect(screen.getByTestId('plan-step-5')).toHaveTextContent(/32.0% → 30.0%/);
    expect(screen.getByRole('switch', { name: 'Aim for 10% utilization' })).toBeOnTheScreen();
    expect(screen.getByTestId('plan-aim-switch').props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(screen.getByTestId('disclaimer')).toBeOnTheScreen();
  });

  it('shows the 10% table when the switch is turned on', async () => {
    await renderPlan();

    await fireEvent.press(screen.getByTestId('plan-aim-switch'));

    expect(screen.getByTestId('plan-util-after')).toHaveTextContent('7.3%');
    expect(screen.getByTestId('plan-highest')).toHaveTextContent('Highest card 81.0% → 10.0%');
    expect(screen.getByTestId('plan-leftover')).toHaveTextContent('₹7,000');
    expect(screen.getByTestId('plan-step-5')).toHaveTextContent(/₹26,400/);
  });

  it('shows SBI 14,400 for the admin demo moment (threshold 20%, switch off)', async () => {
    const seed = parseSeed(aaravSeed);
    await renderPlan(createDemoRepository({ ...seed, rules: { ...seed.rules, thresholdPct: 20 } }));

    expect(screen.getByTestId('plan-step-5')).toHaveTextContent(/₹14,400/);
    expect(screen.getByTestId('plan-leftover')).toHaveTextContent('₹19,000');
  });

  it('opens Mark as paid for the card of the step that was pressed', async () => {
    await renderPlan();

    await fireEvent.press(screen.getByTestId('plan-step-1-mark-paid'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/mark-paid',
      params: { cardId: 'axis-neo', aim10: '0', cash: '120000' },
    });
  });

  it('shows a shortfall instead of hiding it when cash cannot cover the minimums', async () => {
    await renderPlan();

    await fireEvent.press(screen.getByTestId('plan-cash-edit'));
    await fireEvent.changeText(screen.getByTestId('plan-cash-input'), '1000');

    expect(screen.getByTestId('plan-shortfalls')).toBeOnTheScreen();
    expect(screen.getByTestId('plan-shortfall-hdfc-millennia')).toHaveTextContent(/short/);
  });

  it('navigates with the floating nav', async () => {
    await renderPlan();

    await fireEvent.press(screen.getByTestId('nav-tab-home'));

    expect(mockRouter.navigate).toHaveBeenCalledWith('/home');
  });
});

describe('Plan updates after Mark as paid', () => {
  it('marks steps 01 and 03 paid and keeps them listed when the sheet records 12,400', async () => {
    const repository = createDemoRepository();
    await render(
      <DemoRepositoryProvider repository={repository}>
        <PlanScreen />
        <MarkPaidSheet cardId="axis-neo" />
      </DemoRepositoryProvider>,
    );

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(repository.listPayments()).toEqual([
      expect.objectContaining({ cardId: 'axis-neo', amount: 12400, date: DEMO_TODAY }),
    ]);
    expect(screen.getByTestId('plan-step-3')).toHaveTextContent(/✓ PAID · 21 OCT/);
    expect(screen.getByTestId('plan-step-1')).toHaveTextContent(/✓ PAID/);
    expect(screen.getByTestId('plan-step-5-mark-paid')).toBeOnTheScreen();
    expect(screen.getByTestId('plan-leftover')).toHaveTextContent('₹31,000');
  });
});

jest.setTimeout(30000); // first render compiles the kit; slow on a loaded machine
