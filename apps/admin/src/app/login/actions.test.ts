import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet, delete: cookieDelete }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/lib/supabase', () => ({ supabaseFor: () => ({ auth: { signInWithPassword } }) }));

import { signIn, signOut } from './actions';

function form(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set('email', email);
  fd.set('password', password);
  return fd;
}

describe('signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.unstubAllEnvs();
  });

  it('asks for both fields without calling Supabase', async () => {
    expect(await signIn({}, form('', ''))).toEqual({ error: 'Enter your email and password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('sets an httpOnly lax cookie with maxAge from expires_in, then goes to /rules', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok', expires_in: 3600 } },
      error: null,
    });
    await expect(signIn({}, form(' a@x.io ', 'pw'))).rejects.toThrow('redirect:/rules');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@x.io', password: 'pw' });
    expect(cookieSet).toHaveBeenCalledWith(
      'cc_admin_token',
      'tok',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 }),
    );
  });

  it('marks the cookie secure only in production', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok', expires_in: 60 } },
      error: null,
    });
    vi.stubEnv('NODE_ENV', 'production');
    await expect(signIn({}, form('a@x.io', 'pw'))).rejects.toThrow('redirect:/rules');
    expect(cookieSet.mock.calls[0]?.[2]).toMatchObject({ secure: true });
    cookieSet.mockClear();
    vi.stubEnv('NODE_ENV', 'development');
    await expect(signIn({}, form('a@x.io', 'pw'))).rejects.toThrow('redirect:/rules');
    expect(cookieSet.mock.calls[0]?.[2]).toMatchObject({ secure: false });
  });

  it('shows the invalid-credentials text only for invalid_credentials', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'x' },
    });
    expect(await signIn({}, form('a@x.io', 'bad'))).toEqual({
      error: 'Invalid email or password.',
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('shows a try-again message and logs for any other error', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 503, code: undefined, message: 'down' },
    });
    const r = await signIn({}, form('a@x.io', 'pw'));
    expect(r.error).toMatch(/try again/i);
    expect(r.error).not.toMatch(/invalid/i);
    expect(console.error).toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('treats a success with no session as a try-again error', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
    expect((await signIn({}, form('a@x.io', 'pw'))).error).toMatch(/try again/i);
  });
});

describe('signOut', () => {
  it('deletes the cookie and goes to /login', async () => {
    await expect(signOut()).rejects.toThrow('redirect:/login');
    expect(cookieDelete).toHaveBeenCalledWith('cc_admin_token');
  });
});
