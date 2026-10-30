import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '../login/actions';
import { getSession } from '@/lib/session';
import styles from '../admin.module.css';

async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

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
      <main className={styles.page}>
        {session.isAdmin ? (
          children
        ) : (
          <p role="alert" data-testid="not-admin">
            Not an admin. This account can sign in but cannot view or edit the control center. Ask
            the project owner to grant the admin role.
          </p>
        )}
      </main>
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
