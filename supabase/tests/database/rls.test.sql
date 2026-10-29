-- PD-5: row-level security isolation tests (pgTAP).
--
-- WRITTEN BUT NOT EXECUTED against the Supabase local stack: the stack needs Docker, which was
-- off while PD-5 was built. Run it once Docker is up:
--     pnpm exec supabase start
--     pnpm exec supabase db reset
--     pnpm exec supabase test db
-- Everything runs in one transaction that is rolled back at the end.
--
-- Actors, each set through the JWT claims the API would carry:
--   A, B     two ordinary users (authenticated role)
--   C        an anonymous sign-in user ("Try sample profile"): authenticated role, is_anonymous = true
--   D        an admin: app_metadata.role = 'admin', not anonymous
--   anon     the API key alone, nobody signed in (anon role)
--   postgres a direct database session (migrations, seed, the scheduled reset)

begin;
select no_plan();

-- ---- fixtures, written as postgres -------------------------------------------------------------
insert into auth.users (id, email, is_anonymous, raw_app_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.test', false, '{}'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.test', false, '{}'),
  ('00000000-0000-4000-8000-00000000000c', null, true, '{}'),
  ('00000000-0000-4000-8000-00000000000d', 'admin@example.test', false, '{"role":"admin"}');

insert into public.profiles (id, display_name, pan_masked) values
  ('00000000-0000-4000-8000-00000000000a', 'User A', 'ABXXXXX34F'),
  ('00000000-0000-4000-8000-00000000000b', 'User B', 'CDXXXXX12K');

insert into public.cards (id, user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', 'A Card One', 'Bank A', 100000, 20000, 15, 4),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 'A Card Two', 'Bank A', 50000, 10000, 2, 22),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', 'B Card One', 'Bank B', 80000, 30000, 10, 28);

insert into public.payments (id, user_id, card_id, amount, paid_on) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 500, '2026-10-20'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 700, '2026-10-20');

insert into public.consents (user_id, purpose, pan_masked) values
  ('00000000-0000-4000-8000-00000000000a', 'bureau_report_fetch', 'ABXXXXX34F'),
  ('00000000-0000-4000-8000-00000000000b', 'bureau_report_fetch', 'CDXXXXX12K');

select is((select count(*)::int from public.sample_profiles), 3, 'seed: three sample personas exist');
select is((select count(*)::int from public.coach_rules), 1, 'seed: exactly one global rules row');
select is((select threshold_pct from public.coach_rules), 30, 'seed: default threshold is 30');
select is((select count(*)::int from public.audit_log), 0, 'seed: the audit log starts empty');

-- Two more users for the account-deletion checks (E deletes their profile, F loses their auth user),
-- one audit row so "A cannot read the audit log" is not vacuous, and a helper that reports how many
-- rows a statement touched (RLS hides rows, so a blocked write is "0 rows", not an error).
insert into auth.users (id, email, is_anonymous, raw_app_meta_data) values
  ('00000000-0000-4000-8000-00000000000e', 'e@example.test', false, '{}'),
  ('00000000-0000-4000-8000-00000000000f', 'f@example.test', false, '{}');
insert into public.profiles (id, display_name, pan_masked) values
  ('00000000-0000-4000-8000-00000000000e', 'User E', 'EFXXXXX78P'),
  ('00000000-0000-4000-8000-00000000000f', 'User F', 'GHXXXXX90Q');
insert into public.consents (user_id, purpose, pan_masked) values
  ('00000000-0000-4000-8000-00000000000e', 'bureau_report_fetch', 'EFXXXXX78P'),
  ('00000000-0000-4000-8000-00000000000f', 'bureau_report_fetch', 'GHXXXXX90Q');
insert into public.audit_log (actor_role, table_name, action, row_key) values ('system', 'fixture', 'INSERT', '1');
select is((select count(*)::int from public.audit_log), 1, 'fixture: the audit log has exactly one row for the visibility checks');

create function public.test_rows_affected(p_sql text) returns integer language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$fn$;
grant execute on function public.test_rows_affected(text) to public;

-- =================================================================================================
-- User A
-- =================================================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;

select is((select count(*)::int from public.cards), 2, 'A sees exactly their own two cards');
select is((select count(*)::int from public.cards where user_id = '00000000-0000-4000-8000-00000000000b'), 0, 'A cannot read B''s cards');

-- card_count_for: own count for the caller, null for anybody else's id (it is SECURITY DEFINER, so the
-- check inside the function is the only guard).
select is(public.card_count_for('00000000-0000-4000-8000-00000000000a'), 2::bigint, 'A gets their own card count');
select is(public.card_count_for('00000000-0000-4000-8000-00000000000b'), null, 'A gets null for B''s id');
select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.payments), 1, 'A sees only their own payment');
select is((select count(*)::int from public.consents), 1, 'A sees only their own consent');
select is((select count(*)::int from public.admin_user_overview), 1, 'A sees only themselves in the user overview');
select is((select count(*)::int from public.audit_log), 0, 'A cannot read the audit log (it holds a row)');
select is((select count(*)::int from public.coach_rules), 1, 'A can read the global coach rules');
select is((select count(*)::int from public.sample_profiles), 3, 'A can read the sample profiles');
select is(public.is_admin(), false, 'A is not an admin');

select throws_ok(
  $$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day)
    values ('00000000-0000-4000-8000-00000000000b', 'Planted', 'Bank A', 1000, 0, 1, 2)$$,
  '42501', null, 'A cannot insert a card for B');
select throws_ok(
  $$insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-00000000000b', 'Hijack')$$,
  '42501', null, 'A cannot create a profile for B');
select throws_ok(
  $$insert into public.payments (user_id, card_id, amount, paid_on)
    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', 100, '2026-10-21')$$,
  '23503', null, 'A cannot attach their own payment to B''s card (composite foreign key)');
select throws_ok(
  $$insert into public.payments (user_id, card_id, amount, paid_on)
    values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 100, '2026-10-21')$$,
  '42501', null, 'A cannot insert a payment as B');
select lives_ok(
  $$insert into public.payments (user_id, card_id, amount, paid_on)
    values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 250, '2026-10-21')$$,
  'A can record a payment on their own card');

-- Blocked writes touch zero rows: RLS hides B's rows and the global tables from A.
select is(public.test_rows_affected($$update public.cards set outstanding = 1 where id = '00000000-0000-4000-8000-0000000000b1'$$), 0, 'A updates 0 of B''s cards');
select is(public.test_rows_affected($$delete from public.cards where id = '00000000-0000-4000-8000-0000000000b1'$$), 0, 'A deletes 0 of B''s cards');
select is(public.test_rows_affected($$update public.payments set amount = 1 where id = '00000000-0000-4000-8000-0000000000e2'$$), 0, 'A updates 0 of B''s payments');
select is(public.test_rows_affected($$delete from public.payments where id = '00000000-0000-4000-8000-0000000000e2'$$), 0, 'A deletes 0 of B''s payments');
select is(public.test_rows_affected($$update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-00000000000b'$$), 0, 'A renames 0 of B''s profiles');
select is(public.test_rows_affected($$delete from public.profiles where id = '00000000-0000-4000-8000-00000000000b'$$), 0, 'A deletes 0 of B''s profiles');
select is(public.test_rows_affected($$update public.coach_rules set threshold_pct = 40$$), 0, 'A updates 0 coach_rules rows');
select is(public.test_rows_affected($$delete from public.sample_profiles$$), 0, 'A deletes 0 sample profiles');
select is(public.test_rows_affected($$update public.sample_profiles set score = 900$$), 0, 'A updates 0 sample profiles');

select throws_ok(
  $$insert into public.consents (user_id, purpose, pan_masked)
    values ('00000000-0000-4000-8000-00000000000a', 'bureau_report_fetch', 'ABCDE1234F')$$,
  '23514', null, 'a full PAN is rejected by the masked-only CHECK');
select lives_ok(
  $$insert into public.consents (user_id, purpose, pan_masked)
    values ('00000000-0000-4000-8000-00000000000a', 'ai_explanations', 'ABXXXXX34F')$$,
  'a masked PAN consent is accepted and stamped with a time');
select throws_ok($$update public.consents set purpose = 'rewritten'$$, '42501', null, 'consents are append-only: no update');
select throws_ok($$delete from public.consents$$, '42501', null, 'consents are append-only: no delete');
select throws_ok(
  $$update public.profiles set pan_masked = 'ABCDE1234F' where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'a full PAN cannot be written to a profile');
select throws_ok(
  $$insert into public.sample_profiles (slug, persona, display_name, pan_masked, mobile_masked, score, score_date, cash, history_months, oldest_account_months, report)
    values ('mine', 'thin_file', 'Mine', 'ABXXXXX34F', '+91 98XXXXX210', 700, '2026-10-01', 0, 1, 1, '{"cards":[]}')$$,
  '42501', null, 'A cannot create a sample profile');
select throws_ok($$select public.reset_demo_data()$$, '42501', null, 'A cannot reset the demo data');
select throws_ok($$update public.audit_log set actor_role = 'user'$$, '42501', null, 'A cannot write the audit log');
select throws_ok($$insert into public.audit_log (actor_role, table_name, action, row_key) values ('admin', 'coach_rules', 'UPDATE', '1')$$, '42501', null, 'A cannot insert an audit row');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'A cannot delete audit rows');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'A cannot truncate the audit log');
select throws_ok($$insert into public.coach_rules (id) values (2)$$, '42501', null, 'a non-admin cannot insert coach_rules');
select throws_ok($$delete from public.coach_rules$$, '42501', null, 'a non-admin cannot delete coach_rules');
select throws_ok($$update public.cards set user_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501', null, 'A cannot hand their own card to B (WITH CHECK)');
select throws_ok($$update public.payments set card_id = '00000000-0000-4000-8000-0000000000b1' where id = '00000000-0000-4000-8000-0000000000e1'$$, '23503', null, 'A cannot repoint their payment at B''s card (composite foreign key)');
select throws_ok($$update public.payments set user_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000000e1'$$, '42501', null, 'A cannot hand their payment to B (WITH CHECK)');
select throws_ok($$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values ('00000000-0000-4000-8000-00000000000a', 'ABCDE1234F', 'Bank A', 1000, 0, 1, 2)$$, '23514', null, 'a PAN-shaped card name is rejected');
select throws_ok($$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values ('00000000-0000-4000-8000-00000000000a', 'Card', 'abcde1234f issuer', 1000, 0, 1, 2)$$, '23514', null, 'a PAN-shaped issuer is rejected (any case)');
select throws_ok($$update public.profiles set display_name = 'ABCDE1234F' where id = '00000000-0000-4000-8000-00000000000a'$$, '23514', null, 'a PAN-shaped profile name is rejected');
select throws_ok($$insert into public.consents (user_id, purpose) values ('00000000-0000-4000-8000-00000000000a', 'ABCDE1234F')$$, '23514', null, 'a PAN-shaped consent purpose is rejected');
select throws_ok($$insert into public.consents (user_id, purpose, retention_note) values ('00000000-0000-4000-8000-00000000000a', 'ok_purpose', 'my pan is abcde1234f ok')$$, '23514', null, 'a PAN-shaped retention note is rejected');

-- Consent time and id are the server's, whatever the client sends.
select lives_ok($$insert into public.consents (id, user_id, purpose, granted_at) values ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-00000000000a', 'time_test', '2020-01-01')$$, 'A inserts a consent with a back-dated time and a chosen id');
select is((select granted_at from public.consents where purpose = 'time_test'), now(), 'the stored consent time is now(), not the 2020 value A sent');
select isnt((select id from public.consents where purpose = 'time_test'), '00000000-0000-4000-8000-0000000000c0'::uuid, 'the stored consent id is generated, not the one A sent');

-- Row cap: A has 2 cards; 10 more reach the cap of 12, the 13th is refused.
select lives_ok(
  $$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day)
    select '00000000-0000-4000-8000-00000000000a', 'Bulk ' || g, 'Bank A', 1000, 0, 1, 2 from generate_series(1, 10) g$$,
  'A can reach the 12 card cap');
select throws_ok(
  $$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day)
    values ('00000000-0000-4000-8000-00000000000a', 'Thirteenth', 'Bank A', 1000, 0, 1, 2)$$,
  '54000', null, 'the 13th card is refused');

reset role;
select is((select outstanding from public.cards where id = '00000000-0000-4000-8000-0000000000b1'), 30000, 'A did not change B''s card');
select is((select count(*)::int from public.cards where id = '00000000-0000-4000-8000-0000000000b1'), 1, 'A did not delete B''s card');
select is((select amount from public.payments where id = '00000000-0000-4000-8000-0000000000e2'), 700, 'A did not change B''s payment');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000b'), 'User B', 'A did not rename B');
select is((select threshold_pct from public.coach_rules), 30, 'A did not change the global threshold');
select is((select count(*)::int from public.sample_profiles), 3, 'A did not delete or edit the sample profiles');
select is((select max(score) from public.sample_profiles), 724, 'A did not change a sample score');

-- =================================================================================================
-- User B
-- =================================================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;

select is((select count(*)::int from public.cards), 1, 'B sees exactly their own card');
select is((select count(*)::int from public.cards where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'B cannot read A''s cards');
select is((select count(*)::int from public.payments where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'B cannot read A''s payments');
select is((select count(*)::int from public.consents where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'B cannot read A''s consents');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-00000000000a'), 0, 'B cannot read A''s profile');

select is(public.test_rows_affected($$update public.cards set outstanding = 1 where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B updates 0 of A''s cards');
select is(public.test_rows_affected($$delete from public.cards where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B deletes 0 of A''s cards');
select is(public.test_rows_affected($$update public.payments set amount = 1 where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B updates 0 of A''s payments');
select is(public.test_rows_affected($$delete from public.payments where user_id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B deletes 0 of A''s payments');
select is(public.test_rows_affected($$update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B renames 0 of A''s profiles');
select is(public.test_rows_affected($$delete from public.profiles where id = '00000000-0000-4000-8000-00000000000a'$$), 0, 'B deletes 0 of A''s profiles');
select throws_ok($$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values ('00000000-0000-4000-8000-00000000000a', 'Planted', 'Bank B', 1000, 0, 1, 2)$$, '42501', null, 'B cannot insert a card for A');
select throws_ok($$insert into public.payments (user_id, card_id, amount, paid_on) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 100, '2026-10-21')$$, '42501', null, 'B cannot insert a payment for A');
select throws_ok($$insert into public.consents (user_id, purpose) values ('00000000-0000-4000-8000-00000000000a', 'planted')$$, '42501', null, 'B cannot insert a consent for A');
select throws_ok($$update public.cards set user_id = '00000000-0000-4000-8000-00000000000a' where id = '00000000-0000-4000-8000-0000000000b1'$$, '42501', null, 'B cannot hand their card to A');

reset role;
select is((select count(*)::int from public.cards where user_id = '00000000-0000-4000-8000-00000000000a'), 12, 'B did not change A''s cards');
select is((select sum(amount)::int from public.payments where user_id = '00000000-0000-4000-8000-00000000000a'), 750, 'B did not change A''s payments');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000a'), 'User A', 'B did not rename A');
select is((select count(*)::int from public.consents where user_id = '00000000-0000-4000-8000-00000000000a'), 3, 'B did not add or remove A''s consents');

-- Consents outlive the account. E deletes their own profile; F''s auth user is deleted (cascade).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000e","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
select is(public.test_rows_affected($$delete from public.profiles where id = '00000000-0000-4000-8000-00000000000e'$$), 1, 'E deletes their own profile');
select is((select count(*)::int from public.consents), 1, 'E still sees their consent after deleting the profile');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-00000000000f';
select is((select count(*)::int from public.profiles where id in ('00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000f')), 0, 'both profiles are gone');
select is((select count(*)::int from public.consents where user_id in ('00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000f')), 2, 'both consents survive the profile delete and the auth user delete');
select ok((select min(granted_at) from public.consents where user_id in ('00000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-00000000000f')) = now(), 'and both kept the server time they were stamped with');

-- =================================================================================================
-- The anon role: the API key alone, nobody signed in
-- =================================================================================================
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is((select count(*)::int from public.coach_rules), 1, 'anon can read the coach rules');
select is((select count(*)::int from public.sample_profiles), 3, 'anon can read the sample profiles');
select throws_ok($$select * from public.cards$$, '42501', null, 'anon cannot read cards');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.payments$$, '42501', null, 'anon cannot read payments');
select throws_ok($$select * from public.consents$$, '42501', null, 'anon cannot read consents');
select throws_ok($$select * from public.audit_log$$, '42501', null, 'anon cannot read the audit log');
select throws_ok($$select * from public.admin_user_overview$$, '42501', null, 'anon cannot read the user overview');
select throws_ok($$update public.coach_rules set threshold_pct = 40$$, '42501', null, 'anon cannot change the rules');
select throws_ok($$delete from public.sample_profiles$$, '42501', null, 'anon cannot delete sample profiles');
select throws_ok($$select public.reset_demo_data()$$, '42501', null, 'anon cannot call reset_demo_data');
select throws_ok($$select public.adopt_sample_profile('aarav')$$, '42501', null, 'anon cannot call adopt_sample_profile');
select throws_ok($$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values ('00000000-0000-4000-8000-00000000000a', 'x', 'y', 1, 0, 1, 2)$$, '42501', null, 'anon cannot insert cards');
select throws_ok($$update public.cards set outstanding = 1$$, '42501', null, 'anon cannot update cards');
select throws_ok($$delete from public.cards$$, '42501', null, 'anon cannot delete cards');
select throws_ok($$insert into public.profiles (id) values ('00000000-0000-4000-8000-00000000000a')$$, '42501', null, 'anon cannot insert profiles');
select throws_ok($$update public.profiles set display_name = 'x'$$, '42501', null, 'anon cannot update profiles');
select throws_ok($$delete from public.profiles$$, '42501', null, 'anon cannot delete profiles');
select throws_ok($$insert into public.payments (user_id, card_id, amount, paid_on) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 1, '2026-10-21')$$, '42501', null, 'anon cannot insert payments');
select throws_ok($$update public.payments set amount = 1$$, '42501', null, 'anon cannot update payments');
select throws_ok($$delete from public.payments$$, '42501', null, 'anon cannot delete payments');
select throws_ok($$insert into public.consents (user_id, purpose) values ('00000000-0000-4000-8000-00000000000a', 'x')$$, '42501', null, 'anon cannot insert consents');
select throws_ok($$update public.consents set purpose = 'x'$$, '42501', null, 'anon cannot update consents');
select throws_ok($$delete from public.consents$$, '42501', null, 'anon cannot delete consents');
select throws_ok($$insert into public.sample_profiles (slug, persona, display_name, pan_masked, mobile_masked, score, score_date, cash, history_months, oldest_account_months, report) values ('anon-made', 'thin_file', 'x', 'ABXXXXX34F', '+91 98XXXXX210', 700, '2026-10-01', 0, 1, 1, '{"cards":[]}')$$, '42501', null, 'anon cannot insert sample profiles');
select throws_ok($$update public.sample_profiles set score = 900$$, '42501', null, 'anon cannot update sample profiles');
select throws_ok($$insert into public.coach_rules (id) values (2)$$, '42501', null, 'anon cannot insert coach_rules');
select throws_ok($$delete from public.coach_rules$$, '42501', null, 'anon cannot delete coach_rules');
select throws_ok($$insert into public.audit_log (actor_role, table_name, action, row_key) values ('admin', 'x', 'INSERT', '1')$$, '42501', null, 'anon cannot insert audit rows');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'anon cannot truncate the audit log');
select throws_ok($$truncate public.cards$$, '42501', null, 'anon cannot truncate cards');
select throws_ok($$select public.card_count_for('00000000-0000-4000-8000-00000000000a')$$, '42501', null, 'anon cannot call card_count_for');

reset role;

-- =================================================================================================
-- C: an anonymous sign-in user ("Try sample profile")
-- =================================================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;

select is((select count(*)::int from public.cards), 0, 'C starts with no cards');
select lives_ok($$select public.adopt_sample_profile('aarav')$$, 'C can adopt the Aarav sample profile');
select is((select count(*)::int from public.cards), 3, 'C now has Aarav''s three cards');
select is((select pan_masked from public.profiles), 'ABXXXXX34F', 'C''s profile carries the masked PAN only');
select is((select sum(credit_limit)::int from public.cards), 300000, 'Aarav''s limits total 3,00,000');
select is((select sum(outstanding)::int from public.cards), 135000, 'Aarav''s outstanding totals 1,35,000');
select is((select count(*)::int from public.cards where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'C cannot read A''s cards');
select is(public.is_admin(), false, 'C is not an admin');
select throws_ok($$select public.adopt_sample_profile('nobody')$$, '22023', null, 'an unknown persona is refused');
select lives_ok($$select public.adopt_sample_profile('rohan')$$, 'C can switch to Rohan');
select is((select count(*)::int from public.cards), 2, 'switching replaces the cards: Rohan has two');
select is((select sample_slug from public.profiles), 'rohan', 'the profile now points at Rohan');
select throws_ok($$select public.reset_demo_data()$$, '42501', null, 'C cannot reset the demo data');

-- Even with an admin claim, an anonymous sign-in user is never an admin.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":true,"app_metadata":{"role":"admin"}}', true);
select is(public.is_admin(), false, 'an anonymous user with an admin claim is still not an admin');
select throws_ok($$insert into public.profiles (id) values ('00000000-0000-4000-8000-00000000000b')$$, '42501', null, 'an anonymous user with an admin claim cannot insert a profile for another user');
select is(public.card_count_for('00000000-0000-4000-8000-00000000000b'), null, 'and gets null from card_count_for for another user''s id');
update public.coach_rules set threshold_pct = 40;

reset role;
select is((select threshold_pct from public.coach_rules), 30, 'C did not change the threshold');

-- B must not see C's sample cards.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
select is((select count(*)::int from public.cards where name in ('Kotak 811', 'ICICI Amazon Pay', 'HDFC Millennia')), 0, 'B cannot see C''s sample cards');
reset role;

-- =================================================================================================
-- D: the admin
-- =================================================================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated","is_anonymous":false,"app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select throws_ok($$insert into public.profiles (id) values ('00000000-0000-4000-8000-00000000000a')$$, '42501', null, 'an admin cannot insert a profile for another user');
select is(public.card_count_for('00000000-0000-4000-8000-00000000000a'), 2::bigint, 'an admin gets another user''s card count (counts only)');

select is(public.is_admin(), true, 'D is an admin');
select lives_ok($$update public.coach_rules set threshold_pct = 20$$, 'D can change the threshold from 30 to 20');
select is((select threshold_pct from public.coach_rules), 20, 'the threshold is now 20');
select is((select updated_by from public.coach_rules), '00000000-0000-4000-8000-00000000000d'::uuid, 'the rules row remembers who edited it');

select throws_ok($$update public.coach_rules set threshold_pct = 4$$, '23514', null, 'threshold below 5 is rejected');
select throws_ok($$update public.coach_rules set threshold_pct = 51$$, '23514', null, 'threshold above 50 is rejected');
select lives_ok($$update public.coach_rules set threshold_pct = 5$$, 'threshold 5 is allowed');
select lives_ok($$update public.coach_rules set threshold_pct = 50$$, 'threshold 50 is allowed');
select lives_ok($$update public.coach_rules set threshold_pct = 20$$, 'threshold back to 20');
select throws_ok($$update public.coach_rules set reporting_basis = 'daily'$$, '23514', null, 'unknown reporting basis is rejected');
select throws_ok($$update public.coach_rules set pay_by_buffer_days = 8$$, '23514', null, 'buffer above 7 days is rejected');
select throws_ok($$update public.coach_rules set planner_step_order = array['minimum','minimum','statement','prepay']$$, '23514', null, 'a step order that is not a permutation is rejected');
select lives_ok($$update public.coach_rules set planner_step_order = array['overdue','statement','minimum','prepay']$$, 'a valid step reorder is allowed');
select throws_ok($$update public.coach_rules set predictor_weights = '{"paymentHistory":35}'$$, '23514', null, 'predictor weights must have all seven factors');
select throws_ok($$update public.coach_rules set guard_min_hard_inquiries = 0$$, '23514', null, 'guard N below 1 is rejected');
select throws_ok($$delete from public.coach_rules$$, '42501', null, 'the single rules row cannot be deleted');
select throws_ok($$insert into public.coach_rules (id) values (2)$$, '42501', null, 'a second rules row cannot be inserted');

select is((select count(*)::int from public.audit_log where table_name = 'coach_rules' and action = 'UPDATE'), 5,
  'the audit log recorded the five accepted rule edits (20, 5, 50, 20, reorder) and none of the refused ones');
select is((select actor_role from public.audit_log where table_name = 'coach_rules' order by id limit 1), 'admin', 'the audit entry records the admin role');
select is((select actor_id from public.audit_log where table_name = 'coach_rules' order by id limit 1), '00000000-0000-4000-8000-00000000000d'::uuid, 'the audit entry records who changed the rule');
select is((select old_data ->> 'threshold_pct' from public.audit_log where table_name = 'coach_rules' order by id limit 1), '30', 'the audit entry keeps the old threshold');
select is((select new_data ->> 'threshold_pct' from public.audit_log where table_name = 'coach_rules' order by id limit 1), '20', 'the audit entry keeps the new threshold');
select ok((select changed_at from public.audit_log where table_name = 'coach_rules' order by id limit 1) is not null, 'the audit entry has a timestamp');
select is((select count(*)::int from public.audit_log), 6, 'the log holds the fixture row and the five rule edits, and the admin can read them all');

select throws_ok($$update public.audit_log set actor_role = 'user'$$, '42501', null, 'even an admin cannot rewrite the audit log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'even an admin cannot delete audit rows');

select is((select count(*)::int from public.admin_user_overview), 3, 'the admin sees exactly the three remaining users (A, B, C) in the overview');
select is((select card_count from public.admin_user_overview where id = '00000000-0000-4000-8000-00000000000a'), 12::bigint, 'the overview shows A''s card count');
select is((select card_count from public.admin_user_overview where id = '00000000-0000-4000-8000-00000000000b'), 1::bigint, 'the overview shows B''s card count');
select is((select card_count from public.admin_user_overview where id = '00000000-0000-4000-8000-00000000000c'), 2::bigint, 'the overview shows C''s card count (Rohan has two)');
select is((select count(*)::int from public.cards), 0, 'the admin cannot read anyone''s card rows (counts only)');
select is((select count(*)::int from public.payments), 0, 'the admin cannot read anyone''s payments');
select is((select count(*)::int from public.consents), 0, 'the admin cannot read anyone''s consents');
select is(public.test_rows_affected($$update public.cards set outstanding = 1$$), 0, 'the admin updates 0 cards');
select is(public.test_rows_affected($$delete from public.cards$$), 0, 'the admin deletes 0 cards');
select is(public.test_rows_affected($$update public.profiles set display_name = 'Hacked'$$), 0, 'the admin updates 0 profiles');
select is(public.test_rows_affected($$delete from public.profiles$$), 0, 'the admin deletes 0 profiles');
select is(public.test_rows_affected($$update public.payments set amount = 1$$), 0, 'the admin updates 0 payments');
select is(public.test_rows_affected($$delete from public.payments$$), 0, 'the admin deletes 0 payments');
select throws_ok($$insert into public.cards (user_id, name, issuer, credit_limit, outstanding, statement_day, due_day) values ('00000000-0000-4000-8000-00000000000a', 'Planted', 'Admin', 1000, 0, 1, 2)$$, '42501', null, 'the admin cannot insert a card for someone else');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'the admin cannot truncate the audit log');
select throws_ok($$insert into public.audit_log (actor_role, table_name, action, row_key) values ('admin', 'x', 'INSERT', '1')$$, '42501', null, 'the admin cannot write audit rows through the API');

select lives_ok($$update public.sample_profiles set score = 800 where slug = 'aarav'$$, 'D can edit a sample profile');
select throws_ok($$update public.sample_profiles set pan_masked = 'ABCDE1234F' where slug = 'aarav'$$, '23514', null, 'a full PAN is rejected on sample profiles');
select throws_ok($$update public.sample_profiles set score = 950 where slug = 'aarav'$$, '23514', null, 'a score above 900 is rejected');
select lives_ok(
  $$insert into public.sample_profiles (slug, persona, display_name, pan_masked, mobile_masked, score, score_date, cash, history_months, oldest_account_months, report)
    values ('extra', 'thin_file', 'Extra (sample)', 'ABXXXXX34F', '+91 98XXXXX210', 700, '2026-10-01', 0, 1, 1, '{"cards":[]}')$$,
  'D can add a sample profile');
select is((select count(*)::int from public.sample_profiles), 4, 'there are now four sample profiles');

-- The reset button: restores the rules and the three personas.
select lives_ok($$select public.reset_demo_data()$$, 'D can reset the demo data');
select is((select threshold_pct from public.coach_rules), 30, 'reset restored the default threshold');
select is((select array_to_string(planner_step_order, ',') from public.coach_rules), 'overdue,minimum,statement,prepay', 'reset restored the default step order');
select is((select score from public.sample_profiles where slug = 'aarav'), 724, 'reset restored Aarav''s score');
select is((select count(*)::int from public.sample_profiles), 3, 'reset removed the extra sample profile');
select is((select count(*)::int from public.audit_log where table_name = 'sample_profiles'), 4, 'the audit log holds exactly four sample profile changes: edit, insert, and the reset''s restore and delete');
select is((select count(*)::int from public.audit_log where table_name = 'coach_rules' and action = 'UPDATE'), 6, 'and six coach rule changes: five edits and the reset');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-00000000000a'), 1, 'reset leaves user data alone');

-- An admin edit cannot break "Try sample profile": the report is validated.
select throws_ok($$update public.sample_profiles set report = '{"cards":[{"name":"X","issuer":"Y","outstanding":1,"statementDay":1,"dueDay":2}]}' where slug = 'aarav'$$, '23514', null, 'a card with no limit is rejected');
select throws_ok($$update public.sample_profiles set report = '{"cards":[{"name":"X","issuer":"Y","limit":"lots","outstanding":1,"statementDay":1,"dueDay":2}]}' where slug = 'aarav'$$, '23514', null, 'a text limit is rejected');
select throws_ok($$update public.sample_profiles set report = '{"cards":[{"name":"X","issuer":"Y","limit":1,"outstanding":1,"statementDay":32,"dueDay":2}]}' where slug = 'aarav'$$, '23514', null, 'a statement day of 32 is rejected');
select throws_ok($$update public.sample_profiles set report = '{"cards":[{"name":"ABCDE1234F","issuer":"Y","limit":1,"outstanding":1,"statementDay":1,"dueDay":2}]}' where slug = 'aarav'$$, '23514', null, 'a PAN-shaped card name in a report is rejected');
select throws_ok($$update public.sample_profiles set report = '{"cards":"none"}' where slug = 'aarav'$$, '23514', null, 'cards must be an array');
select throws_ok($$update public.sample_profiles set display_name = 'ABCDE1234F' where slug = 'aarav'$$, '23514', null, 'a PAN-shaped persona name is rejected');
select lives_ok($$update public.sample_profiles set report = '{"cards":[{"name":"Minimal","issuer":"Bank","limit":50000,"outstanding":10000,"statementDay":10,"dueDay":28}]}' where slug = 'aarav'$$, 'a report with only the required card fields is accepted');
select lives_ok($$select public.adopt_sample_profile('aarav')$$, 'and Try sample profile still works on it');
select is((select minimum_due + last_statement_balance + paid_since_statement from public.cards where name = 'Minimal'), 0, 'the optional card fields default to 0');
select is((select secured from public.cards where name = 'Minimal'), false, 'and secured defaults to false');

reset role;

-- An anonymous sign-in user carrying an admin claim still cannot read the audit log (which now has rows).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":true,"app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select is((select count(*)::int from public.audit_log), 0, 'an anonymous user with an admin claim cannot read the audit log');
select is((select count(*)::int from public.admin_user_overview), 1, 'and sees only themselves in the user overview');
select is((select card_count from public.admin_user_overview), 2::bigint, 'with their own card count');
reset role;

-- =================================================================================================
-- A direct database session (the scheduled reset, migrations, seed)
-- =================================================================================================
select set_config('request.jwt.claims', '', true);
select lives_ok($$select public.reset_demo_data()$$, 'a direct database session can reset the demo data');
select throws_ok($$update public.audit_log set actor_role = 'user'$$, '42501', null, 'the audit log is append-only even for the table owner (trigger)');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'audit rows cannot be deleted even by the table owner (trigger)');

select * from finish();
rollback;
