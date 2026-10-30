import { diffAudit, shortId, type AuditAction } from '@/lib/audit';
import { loadAsAdmin } from '@/lib/admin-data';
import { gateNotice } from '../GateNotice';
import styles from '../../admin.module.css';

export const metadata = { title: 'Audit log | Credit Coach Admin' };

type AuditRow = {
  id: number;
  changed_at: string;
  actor_id: string | null;
  actor_role: string;
  table_name: string;
  action: AuditAction;
  row_key: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export default async function AuditPage() {
  const loaded = await loadAsAdmin((db) =>
    db
      .from('audit_log')
      .select(
        'id, changed_at, actor_id, actor_role, table_name, action, row_key, old_data, new_data',
      )
      .order('changed_at', { ascending: false })
      .limit(50)
      .overrideTypes<AuditRow[], { merge: false }>(),
  );
  if (loaded.status !== 'ok') return gateNotice(loaded.status);
  const { data, error } = loaded.result;
  if (error) console.error('[admin] audit load failed', error.code, error.message);

  return (
    <>
      <h1>Audit log</h1>
      <p>The latest 50 changes to the rules and sample profiles.</p>
      {error ? <p role="alert">Could not load the audit log. Try again.</p> : null}
      {!error && (data ?? []).length === 0 ? (
        <p data-testid="audit-empty">No changes recorded yet.</p>
      ) : null}
      {(data ?? []).length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Table</th>
              <th>Action</th>
              <th>Row</th>
              <th>Changes (before to after)</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r, i) => (
              <tr key={r.id} data-testid={`audit-row-${i}`}>
                <td>{r.changed_at}</td>
                <td>
                  {r.actor_role} ({shortId(r.actor_id)})
                </td>
                <td>{r.table_name}</td>
                <td>{r.action}</td>
                <td>{r.row_key}</td>
                <td>
                  <ul>
                    {diffAudit(r.action, r.old_data, r.new_data).map((d) => (
                      <li key={d.field}>
                        {d.field}: {d.before} &rarr; {d.after}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
