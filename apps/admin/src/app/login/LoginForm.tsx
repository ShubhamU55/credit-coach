'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';
import styles from '../admin.module.css';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action} className={styles.card}>
      <label className={styles.field}>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className={styles.field}>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p role="alert" className={styles.error} data-testid="login-error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
