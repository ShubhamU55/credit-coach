import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const query = vi.fn(async () => 'rows');
vi.mock('./session', () => ({ getSession: () => getSession() }));
vi.mock('./supabase', () => ({ supabaseFor: () => ({}) }));

import { loadAsAdmin } from './admin-data';

const session = (isAdmin: boolean) => ({
  kind: 'ok',
  session: { token: 't', userId: 'u', email: 'e', isAdmin },
});

describe('loadAsAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs the query for an admin', async () => {
    getSession.mockResolvedValue(session(true));
    expect(await loadAsAdmin(query)).toEqual({ status: 'ok', result: 'rows' });
    expect(query).toHaveBeenCalledOnce();
  });

  it('issues no query for a signed-in non-admin', async () => {
    getSession.mockResolvedValue(session(false));
    expect(await loadAsAdmin(query)).toEqual({ status: 'not-admin' });
    expect(query).not.toHaveBeenCalled();
  });

  it('issues no query when signed out or when the session is unavailable', async () => {
    getSession.mockResolvedValue({ kind: 'none' });
    expect(await loadAsAdmin(query)).toEqual({ status: 'signed-out' });
    getSession.mockResolvedValue({ kind: 'unavailable' });
    expect(await loadAsAdmin(query)).toEqual({ status: 'unavailable' });
    expect(query).not.toHaveBeenCalled();
  });
});
