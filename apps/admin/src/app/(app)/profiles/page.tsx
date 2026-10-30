import { safeMaskedMobile, safeMaskedPan } from '@/lib/masked';
import { getSession } from '@/lib/session';
import { supabaseFor } from '@/lib/supabase';
import styles from '../../admin.module.css';

export const metadata = { title: 'Sample profiles | Credit Coach Admin' };

export default async function ProfilesPage() {
  const session = await getSession();
  const { data, error } = await supabaseFor(session?.token)
    .from('sample_profiles')
    .select(
      'slug, persona, display_name, pan_masked, mobile_masked, score, score_date, is_default, sort_order',
    )
    .order('sort_order');

  return (
    <>
      <h1>Sample profiles</h1>
      <p>
        The demo personas the bureau provider returns. Read-only for now: creating and editing
        profiles is planned. PAN and mobile are shown only in their masked form.
      </p>
      {error ? <p role="alert">Could not load the profiles: {error.message}</p> : null}
      {(data ?? []).length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Slug</th>
              <th>Persona</th>
              <th>Name</th>
              <th>PAN</th>
              <th>Mobile</th>
              <th>Score</th>
              <th>As of</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={String(p.slug)} data-testid="profile-row">
                <td>{String(p.slug)}</td>
                <td>{String(p.persona)}</td>
                <td>{String(p.display_name)}</td>
                <td>{safeMaskedPan(p.pan_masked)}</td>
                <td>{safeMaskedMobile(p.mobile_masked)}</td>
                <td>{String(p.score)}</td>
                <td>{String(p.score_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
