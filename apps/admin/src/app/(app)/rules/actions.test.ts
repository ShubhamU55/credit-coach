import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RAW_RULES } from '@/lib/validation';

const getSession = vi.fn();
const select = vi.fn();
const update = vi.fn(() => ({ eq: () => ({ select }) }));
const from = vi.fn(() => ({ update }));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/supabase', () => ({ supabaseFor: () => ({ from }) }));

import { saveRules } from './actions';

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...DEFAULT_RAW_RULES, ...over })) fd.set(k, v ?? '');
  return fd;
}

const admin = { token: 't', userId: 'u', email: 'a@x.io', isAdmin: true };
const idle = { status: 'idle' } as const;

describe('saveRules (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(admin);
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });
  });

  it('sends a signed-out caller to /login without touching the database', async () => {
    getSession.mockResolvedValue(null);
    await expect(saveRules(idle, form())).rejects.toThrow('redirect:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses a non-admin before any database call', async () => {
    getSession.mockResolvedValue({ ...admin, isAdmin: false });
    const r = await saveRules(idle, form());
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/not an admin/i);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range threshold on the server, with the field error', async () => {
    const r = await saveRules(idle, form({ threshold_pct: '51' }));
    expect(r.status).toBe('error');
    expect(r.errors).toHaveProperty('threshold_pct');
    expect(from).not.toHaveBeenCalled();
  });

  it('updates the single coach_rules row with typed values and reports success', async () => {
    const r = await saveRules(idle, form({ threshold_pct: '20' }));
    expect(r.status).toBe('saved');
    expect(from).toHaveBeenCalledWith('coach_rules');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ threshold_pct: 20, reminder_due_days: [3, 1] }),
    );
  });

  it('does not report success when row-level security matched zero rows', async () => {
    select.mockResolvedValue({ data: [], error: null });
    const r = await saveRules(idle, form());
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/not saved/i);
  });

  it('surfaces a database error', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'violates check constraint' } });
    const r = await saveRules(idle, form());
    expect(r.status).toBe('error');
    expect(r.message).toContain('violates check constraint');
  });
});
