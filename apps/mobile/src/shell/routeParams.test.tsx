import { render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import MarkPaidRoute from '../app/mark-paid';
import { DEMO_TODAY } from '../demo/config';
import { createDemoRepository } from '../demo/repository';
import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({})),
}));

const mockParams = useLocalSearchParams as jest.Mock;

async function renderRoute(repository = createDemoRepository()) {
  await render(
    <DemoRepositoryProvider repository={repository}>
      <MarkPaidRoute />
    </DemoRepositoryProvider>,
  );
  return repository;
}

it('uses the first value of an array param', async () => {
  mockParams.mockReturnValue({ cardId: ['hdfc-millennia', 'axis-neo'] });

  const repository = await renderRoute();

  expect(screen.getByTestId('mark-paid-subtitle')).toHaveTextContent(/HDFC Millennia/);
  expect(repository.listPayments()).toEqual([]);
});

it('shows an all-paid state, not card-not-found, when nothing is left and no card is given', async () => {
  mockParams.mockReturnValue({});
  const repository = createDemoRepository();
  for (const c of repository.listCards()) repository.recordPayment(c.id, c.outstanding, DEMO_TODAY);

  await renderRoute(repository);

  expect(screen.getByTestId('mark-paid-invalid')).toHaveTextContent(/all paid/i);
  expect(screen.getByTestId('mark-paid-invalid')).not.toHaveTextContent(/couldn't find/i);
});
