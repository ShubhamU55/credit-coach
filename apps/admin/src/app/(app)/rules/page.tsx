import { loadAsAdmin } from '@/lib/admin-data';
import { rawFromRow } from '@/lib/validation';
import { gateNotice } from '../GateNotice';
import { RulesForm } from './RulesForm';

export const metadata = { title: 'Coach rules | Credit Coach Admin' };

export default async function RulesPage() {
  const loaded = await loadAsAdmin((db) => db.from('coach_rules').select('*').eq('id', 1));
  if (loaded.status !== 'ok') return gateNotice(loaded.status);
  const { data, error } = loaded.result;
  if (error) console.error('[admin] rules load failed', error.code, error.message);
  const row = data?.[0];

  return (
    <>
      <h1>Coach rules</h1>
      <p>
        These rules are global: an edit changes the plan for every user of the app. Values are
        checked against the same ranges the database enforces.
      </p>
      {error || !row ? (
        <p role="alert">Could not load the rules. Try again.</p>
      ) : (
        <RulesForm initial={rawFromRow(row)} />
      )}
    </>
  );
}
