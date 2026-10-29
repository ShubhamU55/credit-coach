import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import HomeRoute from '../app/home';
import WelcomeRoute from '../app/index';
import MarkPaidRoute from '../app/mark-paid';
import { DEMO_TODAY } from '../demo/config';
import { createDemoRepository } from '../demo/repository';
import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
  Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID={testID}>{children}</Text>;
  },
}));

const mockRouter = router as jest.Mocked<typeof router>;
const mockParams = useLocalSearchParams as jest.Mock;

async function renderWith(element: React.ReactElement, repository = createDemoRepository()) {
  await render(<DemoRepositoryProvider repository={repository}>{element}</DemoRepositoryProvider>);
  return { repository };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
});

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
  it('records nothing just by being opened (a deep link must not pay)', async () => {
    const { repository } = await renderWith(<MarkPaidRoute />);

    expect(repository.listPayments()).toEqual([]);
    expect(screen.getByTestId('mark-paid-sheet')).toBeOnTheScreen();
  });

  it('records the default amount only when Confirm payment is pressed', async () => {
    const { repository } = await renderWith(<MarkPaidRoute />);

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(repository.listPayments()).toHaveLength(1);
    expect(repository.listCards().find((c) => c.id === 'axis-neo')?.outstanding).toBe(3200);
  });

  it('reads the card from the route params and rejects an unknown one', async () => {
    mockParams.mockReturnValue({ cardId: 'ghost' });
    const { repository } = await renderWith(<MarkPaidRoute />);

    expect(screen.getByTestId('mark-paid-invalid')).toBeOnTheScreen();
    expect(repository.listPayments()).toEqual([]);
  });
});

jest.setTimeout(30000); // first render compiles the kit; slow on a loaded machine
