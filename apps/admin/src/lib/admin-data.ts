import { getSession } from './session';
import { supabaseFor } from './supabase';

type Client = ReturnType<typeof supabaseFor>;

export type AdminLoad<T> =
  | { status: 'ok'; result: T }
  | { status: 'signed-out' }
  | { status: 'unavailable' }
  | { status: 'not-admin' };

/**
 * The page-level admin check. The layout only hides content; a page still runs when the layout
 * shows "Not an admin", so every data page loads through this, and a non-admin or signed-out
 * caller never reaches the query.
 */
export async function loadAsAdmin<T>(
  query: (client: Client) => PromiseLike<T>,
): Promise<AdminLoad<T>> {
  const state = await getSession();
  if (state.kind === 'none') return { status: 'signed-out' };
  if (state.kind === 'unavailable') return { status: 'unavailable' };
  if (!state.session.isAdmin) return { status: 'not-admin' };
  return { status: 'ok', result: await query(supabaseFor(state.session.token)) };
}
