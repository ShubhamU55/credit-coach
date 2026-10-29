import { renderHook, waitFor } from '@testing-library/react-native';
import {
  DEFAULT_COACH_RULES,
  planPayments,
  type Card,
  type ExplainCard,
} from '@credit-coach/engine';

import { useExplanation } from './useExplanation';

const AXIS: Card = {
  id: 'axis-neo',
  name: 'Axis Neo',
  issuer: 'Axis Bank',
  limit: 80000,
  outstanding: 15600,
  lastStatementBalance: 12400,
  statementDay: 2,
  dueDay: 22,
  minimumDue: 620,
  paidSinceStatement: 0,
};
const CARDS: ExplainCard[] = [{ id: AXIS.id, name: AXIS.name }];
const CONTEXT = { today: '2026-10-21', rules: DEFAULT_COACH_RULES };
const PLAN = planPayments({
  cards: [AXIS],
  cash: 20000,
  today: '2026-10-21',
  rules: DEFAULT_COACH_RULES,
});
const CONFIG = { url: 'https://example.test', anonKey: 'anon' };

const respond = (body: unknown): typeof fetch =>
  jest.fn(
    async () => ({ ok: true, json: async () => body }) as Response,
  ) as unknown as typeof fetch;

describe('useExplanation', () => {
  it('shows the template at once and never calls out without configuration', async () => {
    const fetchImpl = respond({ text: 'AI', source: 'ai' });

    const { result } = await renderHook(() =>
      useExplanation(PLAN, CARDS, CONTEXT, { config: null, fetchImpl }),
    );

    expect(result.current.aiWritten).toBe(false);
    expect(result.current.text).toContain('Axis Neo');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('swaps in the AI text and the AI label when the function answers', async () => {
    const fetchImpl = respond({ text: 'Pay Axis first so it stays on time.', source: 'ai' });

    const { result } = await renderHook(() =>
      useExplanation(PLAN, CARDS, CONTEXT, { config: CONFIG, fetchImpl }),
    );

    await waitFor(() => expect(result.current.aiWritten).toBe(true));
    expect(result.current.text).toBe('Pay Axis first so it stays on time.');
    expect(result.current.loading).toBe(false);
  });

  it('stays on the template, with the plain label, when the function returns junk', async () => {
    const fetchImpl = respond({ nope: true });

    const { result } = await renderHook(() =>
      useExplanation(PLAN, CARDS, CONTEXT, { config: CONFIG, fetchImpl }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.aiWritten).toBe(false);
  });
});

describe('useExplanation request lifecycle', () => {
  const deferred = () => {
    let resolve!: (r: Response) => void;
    const promise = new Promise<Response>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

  it('fetches once when re-rendered with new but equal inputs', async () => {
    const fetchImpl = respond({ text: 'Pay Axis first.', source: 'ai' });
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

    const { result, rerender } = await renderHook(
      (_tick: number) =>
        useExplanation(clone(PLAN), clone(CARDS), clone(CONTEXT), {
          config: { ...CONFIG },
          fetchImpl: ((...a: Parameters<typeof fetch>) => fetchImpl(...a)) as typeof fetch,
        }),
      { initialProps: 0 },
    );
    await waitFor(() => expect(result.current.aiWritten).toBe(true));
    await rerender(1);
    await rerender(2);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale answer when the plan changes mid-flight', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const fetchImpl = jest.fn(() => queue.shift()!.promise) as unknown as typeof fetch;
    const plan2 = planPayments({
      cards: [AXIS],
      cash: 1000,
      today: '2026-10-21',
      rules: DEFAULT_COACH_RULES,
    });

    const { result, rerender } = await renderHook(
      ({ plan }: { plan: typeof PLAN }) =>
        useExplanation(plan, CARDS, CONTEXT, { config: CONFIG, fetchImpl }),
      { initialProps: { plan: PLAN } },
    );
    await rerender({ plan: plan2 });
    second.resolve(ok({ text: 'NEW', source: 'ai' }));
    await waitFor(() => expect(result.current.text).toBe('NEW'));
    first.resolve(ok({ text: 'OLD', source: 'ai' }));
    await Promise.resolve();

    expect(result.current.text).toBe('NEW');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight call on unmount', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = jest.fn((_u: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const { unmount } = await renderHook(() =>
      useExplanation(PLAN, CARDS, CONTEXT, { config: CONFIG, fetchImpl }),
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await unmount();

    expect(signal?.aborted).toBe(true);
  });
});
