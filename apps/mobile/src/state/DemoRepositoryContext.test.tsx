import { memo, useEffect, type ReactNode } from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { DEMO_TODAY } from '../demo/config';
import { createDemoRepository } from '../demo/repository';
import {
  DemoRepositoryProvider,
  useCards,
  useDemoRepository,
  usePayments,
  useProfile,
} from './DemoRepositoryContext';

function AxisOutstanding() {
  const axis = useCards().find((card) => card.id === 'axis-neo');
  return <Text testID="axis">{axis?.outstanding}</Text>;
}

// No props: only a subscription can make it show fresh data.
const MemoAxisOutstanding = memo(AxisOutstanding);

function PaymentCount() {
  return <Text testID="payments">{usePayments().length}</Text>;
}

function WriteOnMount({ amount }: { amount: number }) {
  const repository = useDemoRepository();
  useEffect(() => {
    repository.recordPayment('axis-neo', amount, DEMO_TODAY);
  }, [repository, amount]);
  return null;
}

function wrap(children: ReactNode, repository = createDemoRepository()) {
  return {
    repository,
    ui: <DemoRepositoryProvider repository={repository}>{children}</DemoRepositoryProvider>,
  };
}

describe('repository hooks', () => {
  it('re-render a memoized consumer with fresh data after recordPayment', async () => {
    const { repository, ui } = wrap(<MemoAxisOutstanding />);
    await render(ui);
    expect(screen.getByTestId('axis').props.children).toBe(15600);

    await act(async () => {
      repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    });

    expect(screen.getByTestId('axis').props.children).toBe(14980);
  });

  it('refresh again after reset', async () => {
    const { repository, ui } = wrap(<MemoAxisOutstanding />);
    await render(ui);
    await act(async () => {
      repository.recordPayment('axis-neo', 620, DEMO_TODAY);
    });

    await act(async () => {
      repository.reset();
    });

    expect(screen.getByTestId('axis').props.children).toBe(15600);
  });

  it('show a payment recorded by a descendant mount effect, before the consumer subscribes', async () => {
    const { ui } = wrap(
      <>
        <AxisOutstanding />
        <PaymentCount />
        <WriteOnMount amount={620} />
      </>,
    );

    await render(ui);

    expect(screen.getByTestId('axis').props.children).toBe(14980);
    expect(screen.getByTestId('payments').props.children).toBe(1);
  });

  it('show a mount-effect write made by a child of the consumer', async () => {
    function Parent() {
      const axis = useCards().find((card) => card.id === 'axis-neo');
      return (
        <>
          <Text testID="axis">{axis?.outstanding}</Text>
          <WriteOnMount amount={620} />
        </>
      );
    }

    await render(wrap(<Parent />).ui);

    expect(screen.getByTestId('axis').props.children).toBe(14980);
  });

  it('useProfile returns the sample profile', async () => {
    function Name() {
      return <Text testID="name">{useProfile().firstName}</Text>;
    }

    await render(wrap(<Name />).ui);

    expect(screen.getByTestId('name').props.children).toBe('Aarav');
  });

  it('throws a clear error outside the provider', async () => {
    const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(render(<AxisOutstanding />)).rejects.toThrow(/DemoRepositoryProvider/);

    silence.mockRestore();
  });
});
