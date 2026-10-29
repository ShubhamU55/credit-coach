import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions } from 'react-native';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { DISCLAIMER_TEXT } from '../../ui';
import { WelcomeScreen } from './WelcomeScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockRouter = router as jest.Mocked<typeof router>;

async function renderWelcome(repository = createDemoRepository()) {
  await render(
    <DemoRepositoryProvider repository={repository}>
      <WelcomeScreen />
    </DemoRepositoryProvider>,
  );
  return repository;
}

beforeEach(() => jest.clearAllMocks());

describe('WelcomeScreen', () => {
  it('shows the headline, the three steps, the caption and the disclaimer', async () => {
    await renderWelcome();

    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
    expect(screen.getByText('CREDIT COACH')).toBeTruthy();
    expect(screen.getByRole('header')).toHaveTextContent(
      'Know exactly what to pay, where, and when.',
    );
    expect(screen.getByText('Which card first')).toBeTruthy();
    expect(screen.getByText('How much, by when')).toBeTruthy();
    expect(screen.getByText('Your score, as a range')).toBeTruthy();
    expect(screen.getByText('No sign-up · 10 seconds')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeTruthy();
  });

  it('has the sample profile as the one primary action and no sign-up controls', async () => {
    await renderWelcome();

    expect(screen.getByRole('button', { name: 'Try sample profile' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/create account/i)).toBeNull();
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });

  it('starts from fresh sample data and replaces itself with Home', async () => {
    const repository = createDemoRepository();
    repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    await renderWelcome(repository);

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(repository.listPayments()).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/home');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('hides the decorative card stack from screen readers', async () => {
    await renderWelcome();

    expect(
      screen.getByTestId('welcome-card-stack', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
  });

  it('ignores a second tap while the first one is navigating', async () => {
    const repository = createDemoRepository();
    const reset = jest.spyOn(repository, 'reset');
    await renderWelcome(repository);

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));
    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('shows an error and allows a retry when the reset throws', async () => {
    const repository = createDemoRepository();
    const reset = jest.spyOn(repository, 'reset').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await renderWelcome(repository);

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(screen.getByTestId('welcome-error')).toHaveTextContent(
      'Could not load the sample profile. Try again.',
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(reset).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).toHaveBeenCalledWith('/home');
    expect(screen.queryByTestId('welcome-error')).toBeNull();
  });

  it.each([
    [2, 'column'],
    [1, 'row'],
  ])('lays the three steps out for font scale %s as a %s', async (fontScale, direction) => {
    const spy = jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 360, height: 800, scale: 3, fontScale });
    await renderWelcome();

    expect(screen.getByTestId('welcome-steps').props.style).toMatchObject({
      flexDirection: direction,
    });
    spy.mockRestore();
  });
});
