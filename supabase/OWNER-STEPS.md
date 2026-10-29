# Owner steps: PD-5 Supabase backend

Nothing here was deployed by the agent, and no secret is in the repository. Run these yourself.
Run every command from the repo root unless it says otherwise. The Supabase CLI is a dev
dependency (`pnpm exec supabase ...`), so no global install is needed.

## What is verified and what is not

| Check                                                                                                                                                                                                   | Status                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Function logic: contract, validation, grounding, 3 s timeout, template fallback, no secret logging (`pnpm --filter @credit-coach/supabase test`, 72 tests, mocked fetch under Node)                     | Executed, green                                                                             |
| Template copy pinned to the engine template, personas and Aarav golden plan from the seed data                                                                                                          | Executed, green                                                                             |
| Static SQL guards (RLS on every table, masked-PAN CHECKs, `search_path` pinned, no secrets under `supabase/`)                                                                                           | Executed, green                                                                             |
| The three migrations and `seed.sql` applied to a throwaway embedded Postgres 18 with stubbed `auth` and Supabase roles, then the RLS test file run through a small pgTAP shim: 115 of 115 checks passed | Executed once by hand, scratch tooling, **not part of the repo**                            |
| `supabase db reset` on the real local stack                                                                                                                                                             | **WRITTEN BUT NOT EXECUTED** (needs Docker, which was off)                                  |
| `supabase test db` (`supabase/tests/database/rls.test.sql`, real pgTAP, real GoTrue claims)                                                                                                             | **WRITTEN BUT NOT EXECUTED**                                                                |
| Edge Function under the real Deno runtime (`supabase functions serve explain`)                                                                                                                          | **WRITTEN BUT NOT EXECUTED** (Deno is not installed here; the code was only run under Node) |
| Live call to Anthropic                                                                                                                                                                                  | **Not run.** Needs your key                                                                 |

Do not treat the two "NOT EXECUTED" rows as passing until you have run the commands in section 1.

## 1. Local stack (needs Docker Desktop running)

```bash
pnpm exec supabase start
pnpm exec supabase db reset      # applies migrations/ then seed.sql; must finish without an error
pnpm exec supabase test db       # runs supabase/tests/database/rls.test.sql (pgTAP, ~110 checks)
```

Expected: `db reset` ends with "Finished supabase db reset", and `test db` prints
`Result: PASS` with no `not ok` lines. If a check fails, the line names the rule that broke.
(The embedded run above used a hand-made `auth` stub, so a failure here is most likely a
difference in how real GoTrue sets `request.jwt.claims`; tell me which line.)

Optional local check of the function without a key (template path):

```bash
pnpm exec supabase functions serve explain --no-verify-jwt
curl -s -X POST http://127.0.0.1:54321/functions/v1/explain \
  -H 'content-type: application/json' --data @supabase/examples/explain-aarav.json
# -> {"text":"Minimums come first: ₹620 on Axis Neo by Thu, 22 Oct and ...","source":"template"}
```

## 2. Hosted project: link and push the schema

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push        # applies the three migrations; supabase/seed.sql is NOT run remotely
```

The personas and default rules are inside the third migration (`20261028100200_demo_data.sql`),
so `db push` already loads them. The hosted `config.toml` auth setting does not push itself:

- Dashboard -> Authentication -> Sign In / Providers -> turn on **Allow anonymous sign-ins**
  (local `config.toml` already has it on; this is what "Try sample profile" uses).
- Keep **Enable email provider** on for the admin login. Turn **Confirm email** off if you do not
  want to click a link for the admin account.

## 3. Create the admin user

1. Dashboard -> Authentication -> Users -> **Add user** (email and password, auto-confirm).
2. SQL editor, once:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
where email = '<admin email>';
```

The admin check reads `app_metadata.role = 'admin'` from the signed token, which only the service
role can set. Sign out and in again after the update so the token carries it. Anonymous sign-in
users are never admins, whatever their token says.

## 4. Set the Anthropic key (the only secret) and deploy the function

```bash
pnpm exec supabase secrets set ANTHROPIC_API_KEY=<your key>
pnpm exec supabase functions deploy explain
```

The key is read only in `supabase/functions/explain/index.ts` through `Deno.env.get`. Do not put it
in `.env`, `config.toml` or a commit. `verify_jwt = true` is set for the function, so callers need
the project's anon key (the app already sends it).

## 5. What to check afterwards

1. The live call. Replace the placeholders from Dashboard -> Project Settings -> API:

   ```bash
   curl -s -X POST "https://<ref>.supabase.co/functions/v1/explain" \
     -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" \
     -H "content-type: application/json" --data @supabase/examples/explain-aarav.json
   ```

   Expect `200` and `{"text": "...", "source": "ai"}`. If the text starts with `Minimums come first`
   and `source` is `template`, the function works but the model path fell back: read the function
   logs (Dashboard -> Edge Functions -> explain -> Logs) for the line `explain fallback <code>`.
   Codes: `no_key` (secret missing), `http_401` (bad key), `http_429`/`http_529` (rate limit or
   overload), `timeout` (over 3 s), `ungrounded_numbers` (the model used a number that is not in
   the plan), `unusable_text`, `bad_reply`, `network`. The log never contains the key, the plan or
   the model's words.

2. Bad input is refused: `curl ... --data '{"version":1}'` returns `400` with `{"error":"invalid_payload","field":"today"}`.
3. Anonymous access: in the SQL editor, `select count(*) from public.sample_profiles;` is 3, and
   with only the anon key `GET /rest/v1/cards` must return `[]` or a permission error, never rows.
4. Admin: sign in as the admin, change the threshold (`update public.coach_rules set threshold_pct = 20;`
   from the app or admin panel), then `select * from public.audit_log order by id desc limit 1;` shows
   the admin's id, the old value 30 and the new value 20.
5. Reset: `select public.reset_demo_data();` as the admin restores 30 and the three personas.

## 6. Hand-off to the app and the admin panel

- App (PD-11 client): set `EXPO_PUBLIC_SUPABASE_URL` (https) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
  `apps/mobile/.env.local`. Absent means template only; the app is fully usable either way.
- Admin panel (PD-14): see `supabase/README.md` for table, role and audit column names.

## 7. Optional: daily demo reset during 2 to 5 Nov (PRD section 6)

Not installed by any migration, because it needs the hosted `pg_cron` extension. If you want it,
Dashboard -> Database -> Extensions -> enable `pg_cron`, then in the SQL editor:

```sql
select cron.schedule('reset-demo-data', '30 20 * * *', $$select public.reset_demo_data()$$);  -- 02:00 IST
-- remove after the judging window:
-- select cron.unschedule('reset-demo-data');
```
