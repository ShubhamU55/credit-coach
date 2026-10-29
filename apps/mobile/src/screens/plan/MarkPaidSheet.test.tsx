import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { MarkPaidSheet } from './MarkPaidSheet';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));

const mockRouter = router as jest.Mocked<typeof router>;
const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

async function renderSheet(props: { cardId?: string; amount?: string } = {}) {
  const repository = createDemoRepository();
  await render(
    <DemoRepositoryProvider repository={repository}>
      <MarkPaidSheet {...props} />
    </DemoRepositoryProvider>,
  );
  return repository;
}

beforeEach(() => {
  jest.clearAllMocks();
  announceSpy.mockImplementation(() => undefined);
});

describe('MarkPaidSheet', () => {
  it('opens on Full statement for the primary card and records nothing by itself', async () => {
    const repository = await renderSheet();

    expect(screen.getByTestId('mark-paid-subtitle')).toHaveTextContent(
      'Axis Neo · due Thu, 22 Oct',
    );
    expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹12,400');
    expect(screen.getByTestId('mark-paid-choices-full').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('mark-paid-note')).toHaveTextContent(
      'Paid on today, 21 Oct · This only records it here. Pay in your bank or UPI app.',
    );
    expect(repository.listPayments()).toEqual([]);
  });

  it('records the full statement only on Confirm, then shows and announces the result', async () => {
    const repository = await renderSheet();

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(repository.listCards().find((c) => c.id === 'axis-neo')?.outstanding).toBe(3200);
    expect(screen.getByTestId('mark-paid-recorded')).toHaveTextContent('Recorded ₹12,400.');
    expect(screen.getByTestId('mark-paid-result')).toHaveTextContent(
      "Steps 01 and 03 are done. Axis Neo's statement is cleared — no interest this cycle.",
    );
    expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('Recorded ₹12,400.'));

    await fireEvent.press(screen.getByTestId('mark-paid-back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('records the minimum when Minimum only is chosen', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });

    await fireEvent.press(screen.getByTestId('mark-paid-choices-minimum'));
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(repository.listPayments()).toHaveLength(1);
    expect(repository.listPayments()[0].amount).toBe(620);
    expect(screen.getByTestId('mark-paid-result')).toHaveTextContent(/^Step 01 is done\./);
  });

  it('blocks an empty or too-large Other amount and warns below the minimum', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });
    await fireEvent.press(screen.getByTestId('mark-paid-choices-other'));

    expect(screen.getByTestId('mark-paid-other-message')).toHaveTextContent(
      'Enter the amount you paid.',
    );
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    expect(repository.listPayments()).toEqual([]);

    await fireEvent.changeText(screen.getByTestId('mark-paid-other'), '15601');
    expect(screen.getByTestId('mark-paid-other-message')).toHaveTextContent(
      "That's more than the ₹15,600 outstanding.",
    );
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    expect(repository.listPayments()).toEqual([]);

    await fireEvent.changeText(screen.getByTestId('mark-paid-other'), '500');
    expect(screen.getByTestId('mark-paid-other-message')).toHaveTextContent(/₹120 short/);
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    expect(repository.listPayments()[0].amount).toBe(500);
  });

  it('records a partial amount in whole rupees', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });
    await fireEvent.press(screen.getByTestId('mark-paid-choices-other'));

    await fireEvent.changeText(screen.getByTestId('mark-paid-other'), '5000.75');
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(repository.listPayments()[0].amount).toBe(5000);
  });

  it('shows an error and records nothing for an unknown card from a deep link', async () => {
    const repository = await renderSheet({ cardId: 'nope', amount: '100' });

    expect(screen.getByTestId('mark-paid-invalid')).toBeOnTheScreen();
    expect(screen.queryByTestId('mark-paid-confirm')).toBeNull();
    expect(repository.listPayments()).toEqual([]);
  });

  it.each(['0', '-3', '99999', 'abc'])(
    'ignores a bad amount param %s and never pays on open',
    async (amount) => {
      const repository = await renderSheet({ cardId: 'axis-neo', amount });

      expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹12,400');
      expect(repository.listPayments()).toEqual([]);
    },
  );

  it('prefills a valid amount param into Other but still needs Confirm', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo', amount: '700' });

    expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹700');
    expect(repository.listPayments()).toEqual([]);

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    expect(repository.listPayments()[0]).toMatchObject({ amount: 700, date: DEMO_TODAY });
  });
});
