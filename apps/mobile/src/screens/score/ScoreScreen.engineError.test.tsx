import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { ScoreScreen } from './ScoreScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.setTimeout(30000);

const mockRunWhatIf = jest.fn();
const mockPlanPayments = jest.fn();
const mockCheckGuard = jest.fn();
jest.mock('@credit-coach/engine', () => {
  const actual = jest.requireActual('@credit-coach/engine');
  return {
    ...actual,
    runWhatIf: (...args: unknown[]) => mockRunWhatIf(...args),
    planPayments: (...args: unknown[]) => mockPlanPayments(...args),
    checkApplicationGuard: (...args: unknown[]) => mockCheckGuard(...args),
  };
});

function renderScore() {
  return render(
    <DemoRepositoryProvider repository={createDemoRepository()}>
      <ScoreScreen />
    </DemoRepositoryProvider>,
  );
}

beforeEach(() => {
  const actual = jest.requireActual('@credit-coach/engine');
  mockRunWhatIf.mockImplementation(actual.runWhatIf);
  mockPlanPayments.mockImplementation(actual.planPayments);
  mockCheckGuard.mockImplementation(actual.checkApplicationGuard);
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => jest.restoreAllMocks());

describe('Score screen when the engine throws', () => {
  it('shows the error view for a what-if instead of crashing', async () => {
    const actual = jest.requireActual('@credit-coach/engine');
    mockRunWhatIf.mockImplementation(actual.runWhatIf);
    await render(
      <DemoRepositoryProvider repository={createDemoRepository()}>
        <ScoreScreen />
      </DemoRepositoryProvider>,
    );
    mockRunWhatIf.mockImplementation(() => {
      throw new RangeError('boom');
    });

    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    expect(screen.getByTestId('score-result-error')).toBeTruthy();
  });

  it('still shows the main view when the with-plan run throws', async () => {
    mockRunWhatIf.mockImplementation(() => {
      throw new RangeError('boom');
    });
    await render(
      <DemoRepositoryProvider repository={createDemoRepository()}>
        <ScoreScreen />
      </DemoRepositoryProvider>,
    );

    expect(screen.getByTestId('score-range')).toBeTruthy();
    expect(screen.queryByTestId('score-range-plan')).toBeNull();
  });

  it('still shows the main view when the planner throws', async () => {
    mockPlanPayments.mockImplementation(() => {
      throw new RangeError('plan boom');
    });
    await renderScore();

    expect(screen.getByTestId('score-range')).toBeTruthy();
    expect(screen.queryByTestId('score-range-plan')).toBeNull();
  });

  it('announces a failure and shows the error view when the planner throws on Follow plan', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    await renderScore();
    mockPlanPayments.mockImplementation(() => {
      throw new RangeError('plan boom');
    });

    await fireEvent.press(screen.getByTestId('score-tile-follow-plan'));

    expect(screen.getByTestId('score-result-error')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(expect.stringContaining('couldn’t run that what-if'));
  });

  it('announces a failure when a what-if result is not ok', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    await renderScore();
    mockRunWhatIf.mockImplementation(() => ({ ok: false, error: 'unknown-card' }));

    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    expect(screen.getByTestId('score-result-error')).toBeTruthy();
    expect(send).toHaveBeenCalledWith(expect.stringContaining('couldn’t run that what-if'));
  });

  it('says the application check is unavailable instead of an all-clear when the guard throws', async () => {
    mockCheckGuard.mockImplementation(() => {
      throw new RangeError('guard boom');
    });
    await renderScore();

    expect(screen.getByText('Application check unavailable')).toBeTruthy();
    expect(screen.queryByTestId('score-guard')).toBeNull();
  });

  it('does not swallow an error that is not a RangeError', async () => {
    mockCheckGuard.mockImplementation(() => {
      throw new TypeError('a real bug');
    });

    await expect(renderScore()).rejects.toThrow('a real bug');
  });

  it('logs the refused inputs in development only', async () => {
    mockCheckGuard.mockImplementation(() => {
      throw new RangeError('guard boom');
    });
    await renderScore();

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('guard boom'));
  });
});
