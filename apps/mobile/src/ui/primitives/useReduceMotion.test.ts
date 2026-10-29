import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

type Listener = (enabled: boolean) => void;

function mockReduceMotion(initial: boolean) {
  let listener: Listener = () => {};
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event: string, handler: Listener) => {
      listener = handler;
      return { remove } as never;
    });
  return { emit: (enabled: boolean) => listener(enabled), remove };
}

describe('useReduceMotion', () => {
  afterEach(() => jest.restoreAllMocks());

  test('is true when the system setting is on', async () => {
    mockReduceMotion(true);

    const { result } = await renderHook(() => useReduceMotion());

    expect(result.current).toBe(true);
  });

  test('is false when the system setting is off', async () => {
    mockReduceMotion(false);

    const { result } = await renderHook(() => useReduceMotion());

    expect(result.current).toBe(false);
  });

  test('follows later changes to the system setting', async () => {
    const { emit } = mockReduceMotion(false);
    const { result } = await renderHook(() => useReduceMotion());

    await act(async () => emit(true));

    expect(result.current).toBe(true);
  });

  test('stops listening on unmount', async () => {
    const { remove } = mockReduceMotion(false);
    const { unmount } = await renderHook(() => useReduceMotion());

    await unmount();

    expect(remove).toHaveBeenCalled();
  });

  test('a change event that arrives before the initial read wins over the stale initial value', async () => {
    let resolveInitial: (enabled: boolean) => void = () => {};
    let listener: Listener = () => {};
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInitial = resolve;
      }),
    );
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      handler: Listener,
    ) => {
      listener = handler;
      return { remove: jest.fn() };
    }) as never);
    const { result } = await renderHook(() => useReduceMotion());

    await act(async () => listener(true));
    await act(async () => resolveInitial(false));

    expect(result.current).toBe(true);
  });

  test('stays false (motion allowed) when reading the setting fails', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('no'));
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((() => ({ remove: jest.fn() })) as never);

    const { result } = await renderHook(() => useReduceMotion());

    expect(result.current).toBe(false);
  });
});
