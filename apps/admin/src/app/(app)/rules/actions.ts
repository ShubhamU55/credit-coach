'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { supabaseFor } from '@/lib/supabase';
import { rawFromFormData, validateRules } from '@/lib/validation';

export type SaveState = {
  status: 'idle' | 'saved' | 'error';
  message?: string;
  errors?: Record<string, string>;
};

export async function saveRules(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const state = await getSession();
  if (state.kind === 'none') redirect('/login');
  if (state.kind === 'unavailable') {
    return { status: 'error', message: 'The sign-in service is unavailable. Try again shortly.' };
  }
  const { session } = state;
  if (!session.isAdmin) {
    return { status: 'error', message: 'Not an admin: you cannot edit the rules.' };
  }

  const result = validateRules(rawFromFormData(formData));
  if (!result.ok) {
    return { status: 'error', message: 'Fix the highlighted fields.', errors: result.errors };
  }

  // Runs as the signed-in user, so row-level security is the real gate. Under RLS a refused
  // UPDATE matches zero rows and is not an error, so an empty result must not read as "saved".
  const { data, error } = await supabaseFor(session.token)
    .from('coach_rules')
    .update(result.value)
    .eq('id', 1)
    .select('id');
  if (error) {
    // The detail stays on the server: it can name constraints and columns.
    console.error('[admin] rules update failed', error.code, error.message);
    return { status: 'error', message: 'The database rejected the change. Nothing was saved.' };
  }
  if (!data || data.length === 0) {
    return {
      status: 'error',
      message: 'Not saved: the database did not allow this edit (admins only).',
    };
  }

  revalidatePath('/rules');
  revalidatePath('/audit');
  return {
    status: 'saved',
    message: 'Saved. Mobile apps pick up the new rules on their next refresh.',
  };
}
