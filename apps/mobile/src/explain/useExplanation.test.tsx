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
