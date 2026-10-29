-- PD-5: row-level security on every table, and least-privilege grants.
--
-- Roles seen by the policies
--   anon          the API key alone, nobody signed in. May read the public demo data only.
--   authenticated any signed-in user, including anonymous sign-in ("Try sample profile").
--                 Sees and changes only rows where user_id = auth.uid().
--   admin         an authenticated, non-anonymous user with app_metadata.role = 'admin'
--                 (public.is_admin()). May edit the global rules and sample profiles, and read
--                 the audit log, the profiles (masked) and per-user card COUNTS. Never reads
--                 anyone's cards, payments or consents.
--   service_role  bypasses RLS (Supabase default); used only by the owner and scheduled jobs.

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.payments enable row level security;
alter table public.consents enable row level security;
alter table public.coach_rules enable row level security;
alter table public.sample_profiles enable row level security;
alter table public.audit_log enable row level security;

-- Start from nothing, then grant only what each role needs (Supabase would otherwise grant ALL).
revoke all on public.profiles, public.cards, public.payments, public.consents,
  public.coach_rules, public.sample_profiles, public.audit_log from anon, authenticated;

grant select on public.coach_rules, public.sample_profiles to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.cards, public.payments to authenticated;
grant select, insert on public.consents to authenticated;
grant update on public.coach_rules to authenticated;
grant insert, update, delete on public.sample_profiles to authenticated;
grant select on public.audit_log to authenticated;

-- ---- profiles -------------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

-- ---- cards ----------------------------------------------------------------------------------
-- Owner only. An admin does not read other users' card rows; the admin panel gets card COUNTS through
-- admin_user_overview below.
create policy cards_select on public.cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy cards_insert on public.cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy cards_update on public.cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cards_delete on public.cards for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---- payments (own only; the composite foreign key also ties each payment to the user's own card)
create policy payments_select on public.payments for select to authenticated
  using (user_id = (select auth.uid()));
create policy payments_insert on public.payments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy payments_update on public.payments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy payments_delete on public.payments for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---- consents (own only, append-only: no update or delete grant) ------------------------------
create policy consents_select on public.consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy consents_insert on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---- coach_rules: everyone reads (the app needs the threshold), only admins write -------------
create policy coach_rules_select on public.coach_rules for select to anon, authenticated
  using (true);
create policy coach_rules_update on public.coach_rules for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- sample_profiles: everyone reads (demo bureau provider), only admins write -----------------
create policy sample_profiles_select on public.sample_profiles for select to anon, authenticated
  using (true);
create policy sample_profiles_insert on public.sample_profiles for insert to authenticated
  with check ((select public.is_admin()));
create policy sample_profiles_update on public.sample_profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sample_profiles_delete on public.sample_profiles for delete to authenticated
  using ((select public.is_admin()));

-- ---- audit_log: admins read; nobody writes through the API (the trigger is security definer) -----
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.is_admin()));

-- Number of cards a user has: visible to that user and to an admin, null to anyone else. SECURITY DEFINER
-- so the admin gets the count without being able to select the card rows.
create function public.card_count_for(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user = (select auth.uid()) or public.is_admin()
      then (select count(*) from public.cards c where c.user_id = p_user)
  end;
$$;

revoke all on function public.card_count_for(uuid) from public, anon, authenticated;
grant execute on function public.card_count_for(uuid) to authenticated;

-- Read-only user list for the admin control center: masked PAN and mobile only, plus card counts.
-- security_invoker makes the view obey the caller's RLS, so a non-admin sees just their own row.
create view public.admin_user_overview with (security_invoker = true) as
select
  p.id,
  p.display_name,
  p.pan_masked,
  p.mobile_masked,
  p.sample_slug,
  p.created_at,
  public.card_count_for(p.id) as card_count
from public.profiles p;

revoke all on public.admin_user_overview from anon, authenticated;
grant select on public.admin_user_overview to authenticated;
