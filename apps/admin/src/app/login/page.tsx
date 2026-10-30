import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';
import styles from '../admin.module.css';

export const metadata = { title: 'Sign in | Credit Coach Admin' };

// Cache Components: reading the session cookie must sit inside a Suspense boundary.
async function RedirectIfSignedIn() {
  if (await getSession()) redirect('/rules');
  return null;
}

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <h1>Admin sign in</h1>
      <p>Admin accounts are created by the project owner. There is no self sign-up.</p>
      <LoginForm />
    </main>
  );
}
