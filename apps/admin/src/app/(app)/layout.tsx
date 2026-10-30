import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { gateNotice } from './GateNotice';
import { signOut } from '../login/actions';
import { getSession } from '@/lib/session';
import styles from '../admin.module.css';

async function AppShell({ children }: { children: React.ReactNode }) {
  const state = await getSession();
  if (state.kind === 'none') redirect('/login');
  if (state.kind === 'unavailable') {
    return <main className={styles.page}>{gateNotice('unavailable')}</main>;
  }
  const { session } = state;

  return (
    <>
      <nav className={styles.nav} aria-label="Admin">
        <strong>Credit Coach Admin</strong>
        <Link href="/rules">Rules</Link>
        <Link href="/audit">Audit log</Link>
        <Link href="/profiles">Sample profiles</Link>
        <span className={styles.spacer} />
        <span data-testid="signed-in-as">{session.email}</span>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </nav>
      <main className={styles.page}>{session.isAdmin ? children : gateNotice('not-admin')}</main>
    </>
  );
}

// Cache Components: everything that reads the session cookie sits inside this Suspense boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className={styles.page}>Loading...</p>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
