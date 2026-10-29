# supabase/

Backend for Credit Coach: schema, row-level security, demo data and the `explain` Edge Function.
Owner commands and verification status are in [`OWNER-STEPS.md`](./OWNER-STEPS.md).

```
supabase/
  config.toml                    local stack config (anonymous sign-in on, explain function registered)
  migrations/                    schema, RLS, personas + reset_demo_data(), audit triggers
  seed.sql                       calls reset_demo_data() (local `db reset` only)
  functions/explain/             Edge Function (Deno): index.ts is the entry, handler.ts has the logic
  tests/database/rls.test.sql    pgTAP RLS isolation tests (run with `supabase test db`)
  tests/functions/explain/       vitest contract, validation, grounding, timeout and SQL guard tests
  examples/explain-aarav.json    the exact request the app sends for the Aarav golden plan
```

Run the Docker-free tests with `pnpm --filter @credit-coach/supabase test`.

## Tables (all have row-level security)

| Table                        | Who reads                              | Who writes             | Notes                                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                   | the user; admin                        | the user               | `id = auth.users.id`, anonymous users included. `pan_masked` only (CHECK `ABXXXXX34F`)                                                                                                                                                                                                      |
| `cards`                      | the user only                          | the user               | `user_id`, max 12 per user. Columns follow the engine `Card` (snake_case)                                                                                                                                                                                                                   |
| `payments`                   | the user only                          | the user               | composite FK `(card_id, user_id)` so a payment can only point at the user's own card; max 1000                                                                                                                                                                                              |
| `consents`                   | the user only                          | insert only            | `purpose`, `granted_at` and `id` always set by the server (a trigger overwrites what the client sends), optional masked PAN; append-only. No foreign key: a consent survives the profile and the auth user being deleted (deliberate; erasing one is an owner action with the service role) |
| `coach_rules`                | everyone, including `anon`             | admin only             | single global row (`id = 1`), CHECK ranges (threshold 5 to 50), cannot be deleted                                                                                                                                                                                                           |
| `sample_profiles`            | everyone, including `anon`             | admin only             | the demo bureau provider's personas, masked PAN and mobile                                                                                                                                                                                                                                  |
| `audit_log`                  | admin only                             | the audit trigger only | append-only                                                                                                                                                                                                                                                                                 |
| `admin_user_overview` (view) | the user sees themself; admin sees all | none                   | masked PAN and mobile, card count; `security_invoker`                                                                                                                                                                                                                                       |

## For the admin panel (PD-14)

- **Admin role:** a Supabase Auth user whose `app_metadata.role` is `admin` (set with SQL, see OWNER-STEPS section 3).
  In SQL use `public.is_admin()`; in the app read `session.user.app_metadata.role`. Anonymous users are never admins.
- **Edit rules:** `update public.coach_rules set threshold_pct = 20` (the table has one row). Columns: `threshold_pct`
  (5 to 50), `excellent_pct`, `reporting_basis` (`statement` | `weekly_current`), `pay_by_buffer_days`,
  `planner_step_order` (permutation of `overdue, minimum, statement, prepay`), `predictor_weights` (jsonb, the seven
  engine factors, each 0 to 100), `guard_min_hard_inquiries`, `reminder_prepay_days`, `reminder_due_days`.
  Out-of-range values fail with SQLSTATE `23514`; the panel should show that as a field error.
- **Audit log:** `select changed_at, actor_id, actor_role, table_name, action, row_key, old_data, new_data from public.audit_log order by id desc`.
  A trigger on `coach_rules` and `sample_profiles` writes one row per real change (a no-op update writes nothing).
- **Sample profiles:** `select/insert/update/delete` on `public.sample_profiles`; `report` is jsonb
  `{ "cards": [engine Card + "secured"], "loans": [...] }`.
- **Reset button:** `select public.reset_demo_data()` (RPC). Admin or service role only. It restores the default rules and
  the three personas (Aarav, Ishita, Rohan) and leaves user data alone.

## For the app

- "Try sample profile": `supabase.auth.signInAnonymously()` then `supabase.rpc('adopt_sample_profile', { p_slug: 'aarav' })`.
  That copies the persona into the caller's own `profiles` and `cards` rows. Slugs: `aarav`, `ishita`, `rohan`.
- Read the global rules with `select * from coach_rules` (also allowed for `anon`).
- `explain`: POST the engine `ExplainPayload` to `/functions/v1/explain` with the `apikey` header (anon key) and `Authorization: Bearer <the signed-in user's access token>`, `content-type: application/json`. The anon key alone is refused (401). Answer: `{ text, source }`. Other statuses: 400 bad payload, 413 too large, 415 wrong content type, 429 rate limited (10 per minute per user, best effort, in memory), 503 sign-in service unreachable. The app falls back to its own template on all of them.

## Admin reads counts, not cards

The admin role can read profiles (masked), the audit log and `admin_user_overview` (masked identity plus a card
count from the SECURITY DEFINER helper `card_count_for`). It cannot select other users' `cards`, `payments` or
`consents`, and cannot update or delete them. PD-14's Users page needs only the overview.

## Free-text columns reject PAN-shaped text

`display_name`, card `name` and `issuer`, consent `purpose` and `retention_note` fail with SQLSTATE `23514` if they
contain five letters, four digits and a letter (any case). Sample-profile reports are validated the same way
(`valid_sample_report`): a card needs a name, issuer, limit, outstanding, statement day and due day; the rest default.
