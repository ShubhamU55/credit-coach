-- PD-5: core tables for Credit Coach (PRD 5.1, 5.3, 6).
--
-- Conventions
--   * Money is integer rupees. Dates are `date`. Percentages are whole integers.
--   * The PAN is never stored in full: every PAN column carries a CHECK that only accepts the
--     masked shape `ABXXXXX34F` (first 2 letters, 5 X, 2 digits, 1 letter). A full PAN fails the CHECK.
--   * Row-level security is enabled in the next migration; grants are revoked there too.
--   * The admin role is a JWT claim: `app_metadata.role = 'admin'` (see public.is_admin()).

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- True only for a real (non-anonymous) user whose server-set app_metadata says role = admin.
-- app_metadata can be written only with the service role; user_metadata is user-editable and is
-- never read here. Anonymous sign-in users are never admins, whatever their claims say.
create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Admin-edited tables also remember who touched the row last.
create function public.touch_admin_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Caps rows per user so a throwaway anonymous account cannot fill the database.
-- Usage: execute function public.enforce_row_cap('<max rows per user>').
create function public.enforce_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into v_count
    using new.user_id;
  if v_count >= tg_argv[0]::bigint then
    raise exception 'row limit reached for %', tg_table_name using errcode = '54000';
  end if;
  return new;
end;
$$;

create function public.valid_predictor_weights(w jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_entry record;
begin
  if w is null or jsonb_typeof(w) <> 'object' then
    return false;
  end if;
  if not (w ?& array['paymentHistory', 'overallUtilization', 'maxCardUtilization',
                     'hardInquiries', 'creditAge', 'openAccounts', 'creditMix']) then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(w)) <> 7 then
    return false;
  end if;
  for v_entry in select value from jsonb_each(w) loop
    if jsonb_typeof(v_entry.value) <> 'number' then
      return false;
    end if;
    if (v_entry.value)::numeric < 0 or (v_entry.value)::numeric > 100 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Single global coach rules (PRD 6). One row, enforced by id = 1.
-- ---------------------------------------------------------------------------------------------

create table public.coach_rules (
  id smallint primary key default 1 constraint coach_rules_single_row check (id = 1),
  -- Utilization threshold in percent (PRD 6: validated range 5-50).
  threshold_pct integer not null default 30
    constraint coach_rules_threshold_range check (threshold_pct between 5 and 50),
  -- The "excellent" line, used when the user turns on "Aim for 10%".
  excellent_pct integer not null default 10
    constraint coach_rules_excellent_range check (excellent_pct between 1 and 30),
  reporting_basis text not null default 'statement'
    constraint coach_rules_reporting_basis check (reporting_basis in ('statement', 'weekly_current')),
  pay_by_buffer_days integer not null default 1
    constraint coach_rules_buffer_range check (pay_by_buffer_days between 0 and 7),
  -- A permutation of the four planner steps (packages/engine PLANNER_STEPS).
  planner_step_order text[] not null default array['overdue', 'minimum', 'statement', 'prepay']
    constraint coach_rules_step_order check (
      cardinality(planner_step_order) = 4
      and planner_step_order @> array['overdue', 'minimum', 'statement', 'prepay']
      and planner_step_order <@ array['overdue', 'minimum', 'statement', 'prepay']
    ),
  -- Same keys and defaults as DEFAULT_PREDICTOR_WEIGHTS in the engine.
  predictor_weights jsonb not null default
    '{"paymentHistory":35,"overallUtilization":11,"maxCardUtilization":11,"hardInquiries":12,"creditAge":16,"openAccounts":7,"creditMix":8}'::jsonb
    constraint coach_rules_predictor_weights check (public.valid_predictor_weights(predictor_weights)),
  -- Application guard: warn at this many hard inquiries in 6 months (PRD 5.6, default 2).
  guard_min_hard_inquiries integer not null default 2
    constraint coach_rules_guard_range check (guard_min_hard_inquiries between 1 and 10),
  -- Reminder offsets in days (PRD 5.7).
  reminder_prepay_days integer not null default 2
    constraint coach_rules_prepay_range check (reminder_prepay_days between 0 and 14),
  reminder_due_days integer[] not null default array[3, 1]
    constraint coach_rules_due_days check (
      cardinality(reminder_due_days) between 1 and 5
      and reminder_due_days <@ array[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    ),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.coach_rules default values;

create trigger coach_rules_touch before update on public.coach_rules
  for each row execute function public.touch_admin_edit();

-- No deleting the single global row; reset_demo_data() restores values instead.
create function public.coach_rules_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'coach_rules is a single global row and cannot be deleted' using errcode = '42501';
end;
$$;

create trigger coach_rules_no_delete before delete on public.coach_rules
  for each row execute function public.coach_rules_no_delete();

-- ---------------------------------------------------------------------------------------------
-- Sample profiles: the personas the demo bureau provider returns (PRD 5.1, 6).
-- Primary key is a human-readable slug. Defaults live in reset_demo_data() (next migrations).
-- ---------------------------------------------------------------------------------------------

create table public.sample_profiles (
  slug text primary key constraint sample_profiles_slug_shape check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  persona text not null
    constraint sample_profiles_persona check (persona in ('high_utilizer', 'thin_file', 'recovering')),
  display_name text not null constraint sample_profiles_name_len check (char_length(display_name) between 1 and 80),
  pan_masked text not null constraint sample_profiles_pan_masked check (pan_masked ~ '^[A-Z]{2}X{5}[0-9]{2}[A-Z]$'),
  mobile_masked text not null constraint sample_profiles_mobile_masked check (mobile_masked ~ '^\+91 [0-9]{2}X{5}[0-9]{3}$'),
  -- The last bureau score and when it was fetched (the predictor anchor).
  score integer not null constraint sample_profiles_score_range check (score between 300 and 900),
  score_date date not null,
  -- Cash available to pay cards in the next 30 days for this persona.
  cash integer not null constraint sample_profiles_cash_nonneg check (cash >= 0),
  history_months integer not null constraint sample_profiles_history_nonneg check (history_months >= 0),
  missed_payments integer not null default 0 constraint sample_profiles_missed_nonneg check (missed_payments >= 0),
  oldest_account_months integer not null constraint sample_profiles_oldest_nonneg check (oldest_account_months >= 0),
  hard_inquiries_6m integer not null default 0 constraint sample_profiles_inquiries_nonneg check (hard_inquiries_6m >= 0),
  -- { "cards": [ engine Card shape + "secured" ], "loans": [ ... ] }
  report jsonb not null constraint sample_profiles_report_shape check (
    jsonb_typeof(report) = 'object' and jsonb_typeof(report -> 'cards') = 'array'
  ),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger sample_profiles_touch before update on public.sample_profiles
  for each row execute function public.touch_admin_edit();

-- ---------------------------------------------------------------------------------------------
-- Per-user data. profiles.id = auth.users.id (anonymous sign-in users included).
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text constraint profiles_name_len check (char_length(display_name) between 1 and 80),
  pan_masked text constraint profiles_pan_masked check (pan_masked ~ '^[A-Z]{2}X{5}[0-9]{2}[A-Z]$'),
  mobile_masked text constraint profiles_mobile_masked check (mobile_masked ~ '^\+91 [0-9]{2}X{5}[0-9]{3}$'),
  -- Set when the profile was created by "Try sample profile".
  sample_slug text references public.sample_profiles (slug) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null constraint cards_name_len check (char_length(name) between 1 and 60),
  issuer text not null constraint cards_issuer_len check (char_length(issuer) between 1 and 60),
  credit_limit integer not null constraint cards_limit_nonneg check (credit_limit >= 0),
  outstanding integer not null constraint cards_outstanding_nonneg check (outstanding >= 0),
  last_statement_balance integer not null default 0 constraint cards_statement_nonneg check (last_statement_balance >= 0),
  statement_day integer not null constraint cards_statement_day check (statement_day between 1 and 31),
  due_day integer not null constraint cards_due_day check (due_day between 1 and 31),
  minimum_due integer not null default 0 constraint cards_minimum_nonneg check (minimum_due >= 0),
  paid_since_statement integer not null default 0 constraint cards_paid_nonneg check (paid_since_statement >= 0),
  interest_rate_pct numeric(5, 2) constraint cards_interest_range check (interest_rate_pct between 0 and 100),
  annual_fee integer constraint cards_fee_nonneg check (annual_fee >= 0),
  secured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets payments prove a card belongs to the same user (composite foreign key below).
  constraint cards_id_user_unique unique (id, user_id)
);

create index cards_user_id_idx on public.cards (user_id);

create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();
create trigger cards_cap before insert on public.cards
  for each row execute function public.enforce_row_cap('12');

-- A recorded payment ("Mark as paid", PRD 5.3). The composite foreign key means a payment can
-- only point at a card owned by the same user, so one user can never attach a payment to another's card.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null,
  amount integer not null constraint payments_amount_positive check (amount > 0),
  paid_on date not null,
  created_at timestamptz not null default now(),
  constraint payments_card_same_user foreign key (card_id, user_id)
    references public.cards (id, user_id) on delete cascade
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_card_id_idx on public.payments (card_id);

create trigger payments_cap before insert on public.payments
  for each row execute function public.enforce_row_cap('1000');

-- Consent is recorded with a purpose and a timestamp (PRD 5.1). Append-only for users.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null constraint consents_purpose_len check (char_length(purpose) between 1 and 80),
  pan_masked text constraint consents_pan_masked check (pan_masked ~ '^[A-Z]{2}X{5}[0-9]{2}[A-Z]$'),
  granted_at timestamptz not null default now(),
  retention_note text constraint consents_note_len check (char_length(retention_note) <= 200)
);

create index consents_user_id_idx on public.consents (user_id);

create trigger consents_cap before insert on public.consents
  for each row execute function public.enforce_row_cap('100');

-- ---------------------------------------------------------------------------------------------
-- Audit log (PRD 6: who changed which rule and when). Written only by the audit trigger,
-- which is attached to coach_rules and sample_profiles in a later migration.
-- Columns are the contract for the admin control center (PD-14).
-- ---------------------------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  -- auth.uid() of the caller; null for the service role or a direct database session.
  actor_id uuid,
  -- 'admin' | 'user' | 'service' | 'system'
  actor_role text not null,
  table_name text not null,
  action text not null constraint audit_log_action check (action in ('INSERT', 'UPDATE', 'DELETE')),
  -- The row's key: coach_rules.id or sample_profiles.slug.
  row_key text not null,
  old_data jsonb,
  new_data jsonb
);

create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_uid uuid := auth.uid();
  v_role text;
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  -- An update that changes nothing but the edit stamp is not a change worth recording.
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null;
  end if;

  if v_uid is not null then
    v_role := case when public.is_admin() then 'admin' else 'user' end;
  elsif auth.role() = 'service_role' then
    v_role := 'service';
  else
    v_role := 'system';
  end if;

  insert into public.audit_log (actor_id, actor_role, table_name, action, row_key, old_data, new_data)
  values (v_uid, v_role, tg_table_name, tg_op, coalesce(v_new, v_old) ->> tg_argv[0], v_old, v_new);
  return null;
end;
$$;

create function public.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();
