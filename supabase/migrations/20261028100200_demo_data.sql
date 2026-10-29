-- PD-5: the three demo personas, reset_demo_data(), adopt_sample_profile() and the audit triggers.
--
-- The persona data lives here, in one place, so a hosted `supabase db push` (which does not run
-- seed.sql) gets it too. supabase/seed.sql only calls reset_demo_data(). A vitest case parses the
-- dollar-quoted JSON block below and runs the engine planner on the Aarav cards (docs/design.md section 8).
--
-- Persona sources: Aarav = docs/design.md section 8. Rohan and Ishita = the INFORMATION_ARCHITECTURE
-- edge-state personas and PRD section 6; limits, outstanding balances and statement days the docs do
-- not give were chosen so the documented minimums, due dates and overdue state hold (see the run ledger).

create function public.default_sample_profiles()
returns setof public.sample_profiles
language sql
immutable
set search_path = ''
as $fn$
  select * from jsonb_populate_recordset(null::public.sample_profiles, $json$
[
  {
    "slug": "aarav",
    "persona": "high_utilizer",
    "display_name": "Aarav Mehta (sample)",
    "pan_masked": "ABXXXXX34F",
    "mobile_masked": "+91 98XXXXX210",
    "score": 724,
    "score_date": "2026-10-02",
    "cash": 120000,
    "history_months": 36,
    "missed_payments": 0,
    "oldest_account_months": 74,
    "hard_inquiries_6m": 1,
    "is_default": true,
    "sort_order": 1,
    "report": {
      "cards": [
        {"id": "hdfc-millennia", "name": "HDFC Millennia", "issuer": "HDFC Bank", "limit": 100000, "outstanding": 81000, "lastStatementBalance": 74200, "statementDay": 15, "dueDay": 4, "minimumDue": 3710, "paidSinceStatement": 0, "secured": false},
        {"id": "sbi-simplyclick", "name": "SBI SimplyClick", "issuer": "SBI Card", "limit": 120000, "outstanding": 38400, "lastStatementBalance": 0, "statementDay": 25, "dueDay": 14, "minimumDue": 0, "paidSinceStatement": 0, "secured": false},
        {"id": "axis-neo", "name": "Axis Neo", "issuer": "Axis Bank", "limit": 80000, "outstanding": 15600, "lastStatementBalance": 12400, "statementDay": 2, "dueDay": 22, "minimumDue": 620, "paidSinceStatement": 0, "secured": false}
      ],
      "loans": []
    }
  },
  {
    "slug": "ishita",
    "persona": "thin_file",
    "display_name": "Ishita Rao (sample)",
    "pan_masked": "CDXXXXX12K",
    "mobile_masked": "+91 87XXXXX431",
    "score": 690,
    "score_date": "2026-10-02",
    "cash": 15000,
    "history_months": 14,
    "missed_payments": 0,
    "oldest_account_months": 14,
    "hard_inquiries_6m": 0,
    "is_default": false,
    "sort_order": 2,
    "report": {
      "cards": [
        {"id": "sbi-unnati", "name": "SBI Unnati", "issuer": "SBI Card", "limit": 50000, "outstanding": 9000, "lastStatementBalance": 8200, "statementDay": 10, "dueDay": 28, "minimumDue": 410, "paidSinceStatement": 0, "secured": true}
      ],
      "loans": []
    }
  },
  {
    "slug": "rohan",
    "persona": "recovering",
    "display_name": "Rohan Iyer (sample)",
    "pan_masked": "EFXXXXX78P",
    "mobile_masked": "+91 99XXXXX562",
    "score": 650,
    "score_date": "2026-10-02",
    "cash": 3000,
    "history_months": 40,
    "missed_payments": 1,
    "oldest_account_months": 52,
    "hard_inquiries_6m": 2,
    "is_default": false,
    "sort_order": 3,
    "report": {
      "cards": [
        {"id": "kotak-811", "name": "Kotak 811", "issuer": "Kotak Mahindra Bank", "limit": 50000, "outstanding": 31000, "lastStatementBalance": 14500, "statementDay": 25, "dueDay": 12, "minimumDue": 1450, "paidSinceStatement": 0, "secured": false},
        {"id": "icici-amazon-pay", "name": "ICICI Amazon Pay", "issuer": "ICICI Bank", "limit": 75000, "outstanding": 34000, "lastStatementBalance": 28800, "statementDay": 5, "dueDay": 25, "minimumDue": 2880, "paidSinceStatement": 0, "secured": false}
      ],
      "loans": [
        {"name": "Personal loan", "lender": "HDFC Bank", "emi": 6200, "outstanding": 180000}
      ]
    }
  }
]
$json$::jsonb);
$fn$;

-- Restores the default coach rules and the three sample profiles. Idempotent. User data is untouched.
-- Callable by an admin (the "Reset demo data" button), the service role (the daily scheduled
-- reset) and a direct database session (migrations, seed). Anyone else gets 42501.
-- "Direct session" means no JWT role claim at all: every API request carries one (anon or
-- authenticated), and EXECUTE is revoked from anon below, so only a real direct connection has none.
create function public.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_admin()
    or coalesce(auth.role(), '') in ('', 'service_role')
  ) then
    raise exception 'reset_demo_data requires the admin role' using errcode = '42501';
  end if;

  update public.coach_rules
  set threshold_pct = default,
      excellent_pct = default,
      reporting_basis = default,
      pay_by_buffer_days = default,
      planner_step_order = default,
      predictor_weights = default,
      guard_min_hard_inquiries = default,
      reminder_prepay_days = default,
      reminder_due_days = default
  where id = 1;

  insert into public.sample_profiles (
    slug, persona, display_name, pan_masked, mobile_masked, score, score_date, cash,
    history_months, missed_payments, oldest_account_months, hard_inquiries_6m, report,
    is_default, sort_order
  )
  select
    d.slug, d.persona, d.display_name, d.pan_masked, d.mobile_masked, d.score, d.score_date, d.cash,
    d.history_months, d.missed_payments, d.oldest_account_months, d.hard_inquiries_6m, d.report,
    d.is_default, d.sort_order
  from public.default_sample_profiles() d
  on conflict (slug) do update set
    persona = excluded.persona,
    display_name = excluded.display_name,
    pan_masked = excluded.pan_masked,
    mobile_masked = excluded.mobile_masked,
    score = excluded.score,
    score_date = excluded.score_date,
    cash = excluded.cash,
    history_months = excluded.history_months,
    missed_payments = excluded.missed_payments,
    oldest_account_months = excluded.oldest_account_months,
    hard_inquiries_6m = excluded.hard_inquiries_6m,
    report = excluded.report,
    is_default = excluded.is_default,
    sort_order = excluded.sort_order;

  delete from public.sample_profiles s
  where s.slug not in (select d.slug from public.default_sample_profiles() d);
end;
$$;

-- "Try sample profile": copies a persona into the caller's own profile and cards.
-- Works for anonymous sign-in users. Only ever touches rows where user_id = auth.uid().
create function public.adopt_sample_profile(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sample public.sample_profiles;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into v_sample from public.sample_profiles where slug = p_slug;
  if not found then
    raise exception 'unknown sample profile' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, pan_masked, mobile_masked, sample_slug)
  values (v_uid, v_sample.display_name, v_sample.pan_masked, v_sample.mobile_masked, v_sample.slug)
  on conflict (id) do update set
    display_name = excluded.display_name,
    pan_masked = excluded.pan_masked,
    mobile_masked = excluded.mobile_masked,
    sample_slug = excluded.sample_slug;

  -- Replaces any earlier persona; payments go with their cards.
  delete from public.cards where user_id = v_uid;

  insert into public.cards (
    user_id, name, issuer, credit_limit, outstanding, last_statement_balance,
    statement_day, due_day, minimum_due, paid_since_statement, interest_rate_pct, secured
  )
  select
    v_uid,
    c ->> 'name',
    c ->> 'issuer',
    (c ->> 'limit')::integer,
    (c ->> 'outstanding')::integer,
    (c ->> 'lastStatementBalance')::integer,
    (c ->> 'statementDay')::integer,
    (c ->> 'dueDay')::integer,
    (c ->> 'minimumDue')::integer,
    (c ->> 'paidSinceStatement')::integer,
    (c ->> 'interestRatePct')::numeric,
    coalesce((c ->> 'secured')::boolean, false)
  from jsonb_array_elements(v_sample.report -> 'cards') c;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default and Supabase adds anon/authenticated on top.
revoke all on function public.default_sample_profiles() from public, anon, authenticated;
revoke all on function public.reset_demo_data() from public, anon, authenticated;
revoke all on function public.adopt_sample_profile(text) from public, anon, authenticated;
grant execute on function public.reset_demo_data() to authenticated, service_role;
grant execute on function public.adopt_sample_profile(text) to authenticated, service_role;

-- Load the defaults first, then start auditing, so the log begins empty.
select public.reset_demo_data();

create trigger coach_rules_audit after insert or update or delete on public.coach_rules
  for each row execute function public.audit_row_change('id');
create trigger sample_profiles_audit after insert or update or delete on public.sample_profiles
  for each row execute function public.audit_row_change('slug');
