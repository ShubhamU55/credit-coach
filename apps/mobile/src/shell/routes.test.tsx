import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import HomeRoute from '../app/home';
import WelcomeRoute from '../app/index';
import MarkPaidRoute from '../app/mark-paid';
import { DEMO_TODAY } from '../demo/config';
import { createDemoRepository } from '../demo/repository';
import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID={testID}>{children}</Text>;
  },
}));

const mockRouter = router as jest.Mocked<typeof router>;

async function renderWith(element: React.ReactElement, repository = createDemoRepository()) {
  await render(<DemoRepositoryProvider repository={repository}>{element}</DemoRepositoryProvider>);
  return { repository };
}

beforeEach(() => jest.clearAllMocks());

describe('Welcome route', () => {
  it('replaces itself with Home so Android back does not return to Welcome', async () => {
    await renderWith(<WelcomeRoute />);

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/home');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('resets the sample data when starting the sample profile', async () => {
    const repository = createDemoRepository();
    repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    await renderWith(<WelcomeRoute />, repository);

    await fireEvent.press(screen.getByTestId('welcome-try-sample'));

    expect(repository.listCards().find((c) => c.id === 'axis-neo')?.outstanding).toBe(15600);
  });
});

describe('Home route', () => {
  it('renders the Home screen from the repository', async () => {
    await renderWith(<HomeRoute />);

    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('home-card-axis-neo')).toBeTruthy();
  });
});

describe('Mark as paid route', () => {
  it('records Axis Neo minimum only when the explicit button is pressed', async () => {
    const { repository } = await renderWith(<MarkPaidRoute />);
    expect(repository.listPayments()).toEqual([]);

    await fireEvent.press(screen.getByTestId('mark-paid-record-axis-minimum'));

    expect(repository.listPayments()).toHaveLength(1);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows the repository error instead of crashing when the payment is rejected', async () => {
    const repository = createDemoRepository();
    repository.recordPayment('axis-neo', 15600, DEMO_TODAY);
    await renderWith(<MarkPaidRoute />, repository);

    await fireEvent.press(screen.getByTestId('mark-paid-record-axis-minimum'));

    expect(screen.getByTestId('mark-paid-error')).toHaveTextContent(/more than the 0 outstanding/);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('records nothing just by being opened (a deep link must not pay)', async () => {
    const { repository } = await renderWith(<MarkPaidRoute />);

    expect(repository.listPayments()).toEqual([]);
  });
});
