'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/session';
import { supabaseFor } from '@/lib/supabase';

export type LoginState = { error?: string };

function retryLater(error: { name?: string; status?: number; code?: string } | null): LoginState {
  console.error('[admin] sign-in failed', error?.name, error?.status, error?.code);
  return { error: 'Could not sign in right now. Try again.' };
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const { data, error } = await supabaseFor().auth.signInWithPassword({ email, password });
  if (error?.code === 'invalid_credentials') return { error: 'Invalid email or password.' };
  if (error || !data.session) return retryLater(error);

  (await cookies()).set(SESSION_COOKIE, data.session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: data.session.expires_in,
  });
  redirect('/rules');
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
