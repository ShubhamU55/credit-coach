import { utilization } from '@credit-coach/engine';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Credit Coach Admin</h1>
        <p data-testid="engine-check">Engine OK: {utilization(4500, 15000)}%</p>
      </main>
    </div>
  );
}
