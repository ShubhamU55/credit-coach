import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieGet = vi.fn();
const getUser = vi.fn();

vi.mock('react', () => ({ cache: <T>(fn: T) => fn }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock('./supabase', () => ({ supabaseFor: () => ({ auth: { getUser } }) }));

import { getSession, isAuthRejection } from './session';

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'a@x.io',
  app_metadata: {},
  user_metadata: {},
  is_anonymous: false,
  ...over,
});

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cookieGet.mockReturnValue({ value: 'tok' });
  });

  it('is signed out when there is no cookie, without calling Supabase', async () => {
    cookieGet.mockReturnValue(undefined);
    expect(await getSession()).toEqual({ kind: 'none' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('marks a non-anonymous user with app_metadata.role admin as admin', async () => {
    getUser.mockResolvedValue({
      data: { user: user({ app_metadata: { role: 'admin' } }) },
      error: null,
    });
    expect(await getSession()).toEqual({
      kind: 'ok',
      session: { token: 'tok', userId: 'u1', email: 'a@x.io', isAdmin: true },
    });
  });

  it('never treats an anonymous user as admin, even with the admin role', async () => {
    getUser.mockResolvedValue({
      data: { user: user({ app_metadata: { role: 'admin' }, is_anonymous: true }) },
      error: null,
    });
    const s = await getSession();
    expect(s.kind === 'ok' && s.session.isAdmin).toBe(false);
  });

  it('ignores user_metadata.role (the user can write it)', async () => {
    getUser.mockResolvedValue({
      data: { user: user({ user_metadata: { role: 'admin' } }) },
      error: null,
    });
    const s = await getSession();
    expect(s.kind === 'ok' && s.session.isAdmin).toBe(false);
  });

  it('is signed out when Supabase rejects the token (401)', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', status: 401, message: 'invalid JWT' },
    });
    expect(await getSession()).toEqual({ kind: 'none' });
  });

  it('is unavailable, and logged, on a non-auth error (never reported as signed out)', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 503, message: 'down' },
    });
    expect(await getSession()).toEqual({ kind: 'unavailable' });
    expect(console.error).toHaveBeenCalled();
  });

  it('is unavailable when the client throws', async () => {
    getUser.mockRejectedValue(new Error('network'));
    expect(await getSession()).toEqual({ kind: 'unavailable' });
  });
});

describe('isAuthRejection', () => {
  it('accepts 401, 403, missing session and known codes; rejects 5xx and unknown', () => {
    expect(isAuthRejection({ status: 401 })).toBe(true);
    expect(isAuthRejection({ status: 403 })).toBe(true);
    expect(isAuthRejection({ name: 'AuthSessionMissingError' })).toBe(true);
    expect(isAuthRejection({ code: 'bad_jwt' })).toBe(true);
    expect(isAuthRejection({ status: 500 })).toBe(false);
    expect(isAuthRejection({ status: 0, name: 'AuthRetryableFetchError' })).toBe(false);
  });
});
