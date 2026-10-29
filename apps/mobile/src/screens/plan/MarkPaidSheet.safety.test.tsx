import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createDemoRepository } from '../../demo/repository';
import { RepositoryError } from '../../demo/types';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { MarkPaidSheet } from './MarkPaidSheet';

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
const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

type Props = { cardId?: string; amount?: string; aim10?: string; cash?: string };

async function renderSheet(props: Props = {}) {
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

describe('leaving the sheet', () => {
  it('goes back when there is history', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByTestId('mark-paid-close'));

    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces with /plan when a cold deep link left no history (Close)', async () => {
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await renderSheet();

    await fireEvent.press(screen.getByTestId('mark-paid-close'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/plan');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('replaces with /plan from Back to plan without history', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    mockRouter.canGoBack.mockReturnValueOnce(false);

    await fireEvent.press(screen.getByTestId('mark-paid-back'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/plan');
  });

  it('replaces with /plan from the invalid state without history', async () => {
    await renderSheet({ cardId: 'nope' });
    mockRouter.canGoBack.mockReturnValueOnce(false);

    await fireEvent.press(screen.getByTestId('mark-paid-close'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/plan');
  });
});

/** The click handler React holds right now: calling it twice shares one render, like two fast taps. */
function confirmClick(): () => void {
  const onClick = screen.getByTestId('mark-paid-confirm').props.onClick as
    ((event: object) => void) | undefined;
  if (!onClick) throw new Error('no click handler on the Confirm button');
  return () => onClick({});
}

describe('safety', () => {
  it('records once when Confirm is double-tapped', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });
    await fireEvent.press(screen.getByTestId('mark-paid-choices-minimum'));
    const onPress = confirmClick();

    // Both taps land before React re-renders, while the form is still mounted.
    await act(async () => {
      onPress();
      onPress();
    });

    expect(repository.listPayments()).toHaveLength(1);
    expect(repository.listPayments()[0].amount).toBe(620);
  });

  it('shows the repository error without announcing or showing Done', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });
    jest.spyOn(repository, 'recordPayment').mockImplementation(() => {
      throw new RepositoryError('amount_exceeds_outstanding', 'Payment is more than outstanding');
    });

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(screen.getByTestId('mark-paid-error')).toHaveTextContent(/more than outstanding/);
    expect(screen.queryByTestId('mark-paid-done')).toBeNull();
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it.each(['12.5', '0012', '0', '-3', 'abc', '99999'])(
    'deep-link amount %s never pays on open, and a valid Confirm tap still pays',
    async (amount) => {
      const repository = await renderSheet({ cardId: 'axis-neo', amount });
      expect(repository.listPayments()).toEqual([]);
      expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹12,400');

      await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

      expect(repository.listPayments()).toHaveLength(1);
    },
  );
});

describe('same plan as the Plan screen', () => {
  it('uses the aim10 param instead of the stored rules', async () => {
    await renderSheet({ cardId: 'sbi-simplyclick', aim10: '1' });

    expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹26,400');
  });

  it('uses the cash param', async () => {
    await renderSheet({ cardId: 'sbi-simplyclick', cash: '1000' });

    // 1,000 of cash cannot fund the SBI pre-payment, so there is no planned amount.
    expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹0');
  });

  it('falls back to the stored rules and cash for invalid params', async () => {
    await renderSheet({ cardId: 'sbi-simplyclick', aim10: 'yes', cash: '-5' });

    expect(screen.getByTestId('mark-paid-amount')).toHaveTextContent('₹2,400');
  });
});

describe('rejected deep-link plan params (dev warning)', () => {
  const warn = jest.spyOn(console, 'warn');
  beforeEach(() => warn.mockImplementation(() => undefined));
  afterAll(() => warn.mockRestore());

  it.each([
    [{ cash: '-5' }, 'cash'],
    [{ cash: '1234567890' }, 'cash'],
    [{ cash: '012' }, 'cash'],
    [{ aim10: 'yes' }, 'aim10'],
  ])('warns once, naming the param, for %j', async (params, name) => {
    await renderSheet({ cardId: 'axis-neo', ...params });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(name);
  });

  it('stays silent for valid or absent params', async () => {
    await renderSheet({ cardId: 'axis-neo', aim10: '0', cash: '5000' });
    await renderSheet({ cardId: 'axis-neo' });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('double submit', () => {
  it('can confirm again after a repository rejection', async () => {
    const repository = await renderSheet({ cardId: 'axis-neo' });
    const record = jest.spyOn(repository, 'recordPayment');
    record.mockImplementationOnce(() => {
      throw new RepositoryError('amount_exceeds_outstanding', 'Payment is more than outstanding');
    });

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));
    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(screen.getByTestId('mark-paid-done')).toBeOnTheScreen();
    expect(record).toHaveBeenCalledTimes(2);
  });
});

describe('accessibility focus', () => {
  it('moves focus to the header on open and to Recorded on Done', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    await renderSheet();
    expect(focus).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('mark-paid-confirm'));

    expect(focus).toHaveBeenCalledTimes(2);
    focus.mockRestore();
  });
});

jest.setTimeout(30000); // first render compiles the kit; slow on a loaded machine
