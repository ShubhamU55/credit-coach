import { createDemoRepository } from '../demo/repository';
import type { BackendClient } from './client';
import { startBackend } from './start';
import { getAccessToken, setAccessToken } from './session';

const CONFIG = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };
const TOKEN = 'header.payload.signature';

const DEFAULT_ROW = {
  threshold_pct: 30,
  excellent_pct: 10,
  reporting_basis: 'statement',
  pay_by_buffer_days: 1,
  planner_step_order: ['overdue', 'minimum', 'statement', 'prepay'],
  guard_min_hard_inquiries: 2,
};

interface FakeOptions {
  signIn?: () => Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
  row?: () => Promise<{ data: unknown; error: unknown }>;
}

function fakeClient(options: FakeOptions = {}) {
  const maybeSingle = jest.fn(options.row ?? (async () => ({ data: DEFAULT_ROW, error: null })));
  const signInAnonymously = jest.fn(
    options.signIn ?? (async () => ({ data: { session: { access_token: TOKEN } }, error: null })),
  );
  const listeners: ((event: string, session: { access_token: string } | null) => void)[] = [];
  const client: BackendClient = {
    auth: {
      signInAnonymously,
      onAuthStateChange: (callback) => {
        listeners.push(callback);
        return {};
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
  return { client, signInAnonymously, maybeSingle, listeners };
}

const never = () => new Promise<never>(() => undefined);

beforeEach(() => {
  setAccessToken(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('startBackend with no usable config', () => {
  it('creates no client and makes no call', async () => {
    const repository = createDemoRepository();
    const getClient = jest.fn();

    await startBackend({ repository, config: null, getClient });

    expect(getClient).not.toHaveBeenCalled();
    expect(repository.getVersion()).toBe(0);
  });
});

describe('startBackend', () => {
  it('signs in anonymously, keeps the token in memory and applies admin rules', async () => {
    const repository = createDemoRepository();
    const { client, signInAnonymously } = fakeClient({
      row: async () => ({ data: { ...DEFAULT_ROW, threshold_pct: 20 }, error: null }),
    });

    await startBackend({ repository, config: CONFIG, getClient: () => client });

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe(TOKEN);
    expect(repository.getRules().thresholdPct).toBe(20);
  });

  it('leaves the rules and the version untouched for the default row', async () => {
    const repository = createDemoRepository();
    const before = repository.getRules();
    const { client } = fakeClient();

    await startBackend({ repository, config: CONFIG, getClient: () => client });

    expect(repository.getRules()).toEqual(before);
    expect(repository.getVersion()).toBe(0);
  });

  it('follows token refreshes from the auth listener', async () => {
    const repository = createDemoRepository();
    const { client, listeners } = fakeClient();
    await startBackend({ repository, config: CONFIG, getClient: () => client });

    listeners.forEach((listener) => listener('TOKEN_REFRESHED', { access_token: 'new.tok.en' }));
    expect(getAccessToken()).toBe('new.tok.en');
    listeners.forEach((listener) => listener('SIGNED_OUT', null));
    expect(getAccessToken()).toBeUndefined();
  });

  it('starts only once per repository', async () => {
    const repository = createDemoRepository();
    const { client, signInAnonymously } = fakeClient();

    await startBackend({ repository, config: CONFIG, getClient: () => client });
    await startBackend({ repository, config: CONFIG, getClient: () => client });

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('keeps the seed rules when sign-in returns an error, and fetches nothing', async () => {
    const repository = createDemoRepository();
    const { client, maybeSingle } = fakeClient({
      signIn: async () => ({ data: { session: null }, error: new Error('anonymous disabled') }),
    });

    await startBackend({ repository, config: CONFIG, getClient: () => client });

    expect(maybeSingle).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeUndefined();
    expect(repository.getVersion()).toBe(0);
  });

  it('keeps the seed rules when sign-in throws (offline)', async () => {
    const repository = createDemoRepository();
    const { client } = fakeClient({
      signIn: async () => {
        throw new TypeError('Network request failed');
      },
    });

    await expect(
      startBackend({ repository, config: CONFIG, getClient: () => client }),
    ).resolves.toBeUndefined();
    expect(repository.getVersion()).toBe(0);
  });

  it('keeps the seed rules when the client cannot even be created', async () => {
    const repository = createDemoRepository();

    await expect(
      startBackend({
        repository,
        config: CONFIG,
        getClient: () => {
          throw new Error('boom');
        },
      }),
    ).resolves.toBeUndefined();
    expect(repository.getVersion()).toBe(0);
  });

  it.each([
    ['the query errors', async () => ({ data: null, error: { message: 'RLS' } })],
    ['no row comes back', async () => ({ data: null, error: null })],
    [
      'the row is out of range',
      async () => ({ data: { ...DEFAULT_ROW, threshold_pct: 99 }, error: null }),
    ],
    [
      'the query throws',
      async () => {
        throw new TypeError('Network request failed');
      },
    ],
  ])('keeps the seed rules when %s', async (_name, row) => {
    const repository = createDemoRepository();
    const { client } = fakeClient({ row });

    await startBackend({ repository, config: CONFIG, getClient: () => client });

    expect(repository.getVersion()).toBe(0);
    expect(repository.getRules().thresholdPct).toBe(30);
  });

  it('gives up on a hanging sign-in after the timeout and applies nothing', async () => {
    jest.useFakeTimers();
    const repository = createDemoRepository();
    const { client, maybeSingle } = fakeClient({ signIn: never });

    const done = startBackend({ repository, config: CONFIG, getClient: () => client });
    await jest.advanceTimersByTimeAsync(3000);
    await done;

    expect(maybeSingle).not.toHaveBeenCalled();
    expect(repository.getVersion()).toBe(0);
  });

  it('gives up on a hanging rules fetch after the timeout and keeps the seed rules', async () => {
    jest.useFakeTimers();
    const repository = createDemoRepository();
    const { client } = fakeClient({ row: never });

    const done = startBackend({ repository, config: CONFIG, getClient: () => client });
    await jest.advanceTimersByTimeAsync(3000);
    await done;

    expect(getAccessToken()).toBe(TOKEN);
    expect(repository.getVersion()).toBe(0);
  });

  it('does not apply a rules answer that arrives after the timeout', async () => {
    jest.useFakeTimers();
    const repository = createDemoRepository();
    let release: (value: { data: unknown; error: unknown }) => void = () => undefined;
    const { client } = fakeClient({
      row: () => new Promise((resolve) => (release = resolve)),
    });

    const done = startBackend({ repository, config: CONFIG, getClient: () => client });
    await jest.advanceTimersByTimeAsync(3000);
    await done;
    release({ data: { ...DEFAULT_ROW, threshold_pct: 20 }, error: null });
    await jest.advanceTimersByTimeAsync(0);

    expect(repository.getRules().thresholdPct).toBe(30);
  });

  it('never logs the token or the key', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const repository = createDemoRepository();
    const { client } = fakeClient({ row: async () => ({ data: null, error: { message: TOKEN } }) });

    await startBackend({ repository, config: CONFIG, getClient: () => client });

    const output = JSON.stringify([warn.mock.calls, log.mock.calls]);
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain(CONFIG.anonKey);
  });
});
