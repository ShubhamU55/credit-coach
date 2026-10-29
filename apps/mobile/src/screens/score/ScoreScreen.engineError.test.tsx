import { fireEvent, render, screen } from '@testing-library/react-native';

import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { ScoreScreen } from './ScoreScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.setTimeout(30000);

const mockRunWhatIf = jest.fn();
jest.mock('@credit-coach/engine', () => {
  const actual = jest.requireActual('@credit-coach/engine');
  return {
    ...actual,
    runWhatIf: (...args: unknown[]) => mockRunWhatIf(...args),
  };
});

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
});
