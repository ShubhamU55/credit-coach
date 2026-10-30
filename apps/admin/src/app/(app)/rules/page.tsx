import { getSession } from '@/lib/session';
import { supabaseFor } from '@/lib/supabase';
import { rawFromRow } from '@/lib/validation';
import { RulesForm } from './RulesForm';

export const metadata = { title: 'Coach rules | Credit Coach Admin' };

export default async function RulesPage() {
  const session = await getSession();
  const { data, error } = await supabaseFor(session?.token)
    .from('coach_rules')
    .select('*')
    .eq('id', 1);
  const row = data?.[0];

  return (
    <>
      <h1>Coach rules</h1>
      <p>
        These rules are global: an edit changes the plan for every user of the app. Values are
        checked against the same ranges the database enforces.
      </p>
      {error || !row ? (
        <p role="alert">Could not load the rules{error ? `: ${error.message}` : ''}.</p>
      ) : (
        <RulesForm initial={rawFromRow(row)} />
      )}
    </>
  );
}
