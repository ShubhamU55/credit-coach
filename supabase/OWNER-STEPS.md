# Owner steps: PD-5 Supabase backend

Nothing here was deployed by the agent, and no secret is in the repository. Run these yourself.
Run every command from the repo root unless it says otherwise. The Supabase CLI is a dev
dependency (`pnpm exec supabase ...`), so no global install is needed.

## What is verified and what is not

| Check                                                                                                                                                                               | Status                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Function logic: auth, rate limit, contract, validation, grounding, timeouts, template fallback, no secret logging (`pnpm --filter @credit-coach/supabase test`, mocked fetch, Node) | Executed, green                                                                             |
| Template copy pinned to the engine template, personas and Aarav golden plan from the seed data                                                                                      | Executed, green                                                                             |
| Static SQL guards (RLS on every table, masked-PAN CHECKs, `search_path` pinned, no secrets under `supabase/`)                                                                       | Executed, green                                                                             |
| The migrations and `seed.sql` applied to a throwaway embedded Postgres 18 with stubbed `auth` and Supabase roles, then the RLS test file through a small pgTAP shim: 204 of 204     | Executed by hand, scratch tooling, **not part of the repo**                                 |
| `supabase db reset` on the real local stack                                                                                                                                         | **WRITTEN BUT NOT EXECUTED** (needs Docker, which was off)                                  |
| `supabase test db` (`supabase/tests/database/rls.test.sql`, real pgTAP, real GoTrue claims)                                                                                         | **WRITTEN BUT NOT EXECUTED**                                                                |
| Edge Function under the real Deno runtime (`supabase functions serve explain`)                                                                                                      | **WRITTEN BUT NOT EXECUTED** (Deno is not installed here; the code was only run under Node) |
| Live call to Anthropic, and the live Supabase Auth user lookup                                                                                                                      | **Not run.** Needs your key and a project                                                   |

Do not treat the "NOT EXECUTED" rows as passing until you have run the commands below.

## 1. Local stack (needs Docker Desktop running)

```bash
pnpm exec supabase start
pnpm exec supabase db reset      # applies migrations/ then seed.sql; must finish without an error
pnpm exec supabase test db       # runs supabase/tests/database/rls.test.sql (pgTAP, about 200 checks)
```

Expected: `db reset` ends with "Finished supabase db reset", and `test db` prints
`Result: PASS` with no `not ok` lines. If a check fails, the line names the rule that broke.
(The embedded run used a hand-made `auth` stub, so a failure here is most likely a difference in
how real GoTrue sets `request.jwt.claims`; tell me which line.)

Optional local check of the function. It needs a real session, because the function refuses the
bare anon key. Get the local keys with `pnpm exec supabase status`, then:

```bash
pnpm exec supabase functions serve explain
# in another terminal: an anonymous session ("Try sample profile" does the same)
TOKEN=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/signup \
  -H "apikey: <local anon key>" -H 'content-type: application/json' --data '{}' \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
curl -s -X POST http://127.0.0.1:54321/functions/v1/explain \
  -H "apikey: <local anon key>" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' --data @supabase/examples/explain-aarav.json
# no key set locally -> {"text":"Minimums come first: ...","source":"template"}
```

## 2. Hosted project: link and push the schema

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push        # applies the migrations; supabase/seed.sql is NOT run remotely
```

The personas and default rules are inside the third migration (`20261028100200_demo_data.sql`),
so `db push` already loads them. The hosted auth settings do not come from `config.toml`:

- Dashboard -> Authentication -> Sign In / Providers -> turn on **Allow anonymous sign-ins**
  (local `config.toml` already has it on; this is what "Try sample profile" uses).
- Keep **Enable email provider** on for the admin login. Turn **Confirm email** off if you do not
  want to click a link for the admin account.
- **Enable CAPTCHA for anonymous sign-ins** (Dashboard -> Authentication -> Attack Protection ->
  hCaptcha or Cloudflare Turnstile). Without it, a script can mint unlimited anonymous users, each of
  which can call `explain` and fill the database up to its row caps. Trade-off, your decision: the app
  must then pass a captcha token to `signInAnonymously`, and the demo path ("Try sample profile" with
  no typing) must still work unaided (non-negotiable 8). If you cannot do both before judging, leave
  CAPTCHA off and rely on the spend cap in section 4.

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

## 4. Set the Anthropic key (the only secret), a spend cap, and deploy the function

1. In the Anthropic console, **set a monthly spend cap** on the workspace that owns the key (and
   use a key made only for this project). This is the real backstop against abuse: the function's
   rate limit is best effort (see below).
2. Then:

```bash
pnpm exec supabase secrets set ANTHROPIC_API_KEY=<your key>
pnpm exec supabase functions deploy explain
```

The key is read only in `supabase/functions/explain/index.ts` through `Deno.env.get`. Do not put it
in `.env`, `config.toml` or a commit. Keep `verify_jwt = true` (the default in `config.toml`): do
not deploy with `--no-verify-jwt`. On top of the gateway check, the function itself requires a
session for a real user (anonymous sign-in users included) and confirms it with Supabase Auth, so
the anon key alone, which ships inside the app, is refused with 401.

**Rate limit.** 10 calls per minute per user and 30 per minute per network address (the platform's `cf-connecting-ip`, else the rightmost `x-forwarded-for` hop; `x-real-ip` is not read and the leftmost hop is client-controlled, so neither is ever used), counted in the
memory of each running instance. It is best effort: counters reset when an instance restarts and each
instance counts separately, so the real ceiling is a few times higher. The durable option, not built
here, is a Postgres counter: a `rate_limits (key text, window_start timestamptz, count int)` table
plus an RPC that upserts and returns the count, called by the function with the service role. Add it
if the spend cap is ever hit.

**After deploy, confirm the proxy hop count.** Send a call with a made-up `x-forwarded-for: 1.2.3.4` and check, from the function's own behaviour (the 31st call in a minute from your own connection must return 429 whatever you put in the header), that the rightmost entry is the address the gateway saw and not something you chose. If it is not, tell the developer: the limiter would be bypassable.

**Anonymous sign-in widens the gap.** `enable_anonymous_sign_ins = true` (`supabase/config.toml`, needed for "Try sample profile") lets one person mint any number of user ids, so the per-user limit is no bound on a determined person. The in-memory per-address limit is the only bound, and it is best effort.

**The Anthropic spend cap is the real backstop.** Set it in the Anthropic console before the demo window. The address limit can still be dodged by a caller who reaches the function through a path that does not set those headers, and counters are per instance. Do not rely on the limiter alone.

## 5. What to check afterwards

1. The live call needs a user session. Sign in anonymously against the hosted project, then call the
   function with the session token (placeholders from Dashboard -> Project Settings -> API):

   ```bash
   TOKEN=$(curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup" \
     -H "apikey: <anon key>" -H 'content-type: application/json' --data '{}' \
     | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
   curl -s -X POST "https://<ref>.supabase.co/functions/v1/explain" \
     -H "apikey: <anon key>" -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' --data @supabase/examples/explain-aarav.json
   ```

   Expect `200` and `{"text": "...", "source": "ai"}`. If the text starts with `Minimums come first`
   and `source` is `template`, the function works but the model path fell back: read the function
   logs (Dashboard -> Edge Functions -> explain -> Logs) for the line `explain fallback <code>`.
   Codes: `no_key` (secret missing), `http_401` (bad Anthropic key), `http_429`/`http_529` (rate limit
   or overload at Anthropic), `timeout` (over 2 s), `ungrounded_or_forbidden` (a number the plan does
   not have, a score claim, closing a card, a link, numbers spelled out), `unusable_text`,
   `bad_reply` (cut off, refused or malformed), `network`. The log never contains the key, the plan or
   the model's words.

   Other answers: `401` with `{"error":"unauthenticated"}` means the caller had no user session (the
   bare anon key, or an expired token): get a fresh token. A `401` from the gateway before the function
   runs means the key is not a JWT (a newer `sb_publishable_` key may not pass `verify_jwt`): use the
   project's legacy anon JWT key for the `apikey` header. `503` means the function could not reach
   Supabase Auth. `429` means the rate limit. Do not turn JWT verification off to get past a 401.

2. Bad input is refused: the same call with `--data '{"version":1}'` returns `400` with
   `{"error":"invalid_payload","field":"today"}`. Without a token it returns `401`, and the model is
   not called.
3. Anonymous access: in the SQL editor, `select count(*) from public.sample_profiles;` is 3, and
   with only the anon key `GET /rest/v1/cards` must return a permission error, never rows.
4. Admin: sign in as the admin, change the threshold (`update public.coach_rules set threshold_pct = 20;`
   from the app or admin panel), then `select * from public.audit_log order by id desc limit 1;` shows
   the admin's id, the old value 30 and the new value 20.
5. Reset: `select public.reset_demo_data();` as the admin restores 30 and the three personas.

## 6. Hand-off to the app and the admin panel

- App (PD-11 client): set `EXPO_PUBLIC_SUPABASE_URL` (https) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
  `apps/mobile/.env.local`. The app must also pass the signed-in user's access token as
  `ExplainConfig.accessToken` (from `supabase.auth.getSession()`); without it the function answers 401
  and the app shows its own template. Absent config means template only; the app is fully usable either way.
- Admin panel (PD-14): see `supabase/README.md` for table, role and audit column names. The admin
  reads card counts only, not card rows.

## 7. Optional: daily demo reset during 2 to 5 Nov (PRD section 6)

Not installed by any migration, because it needs the hosted `pg_cron` extension. If you want it,
Dashboard -> Database -> Extensions -> enable `pg_cron`, then in the SQL editor:

```sql
select cron.schedule('reset-demo-data', '30 20 * * *', $$select public.reset_demo_data()$$);  -- 02:00 IST
-- remove after the judging window:
-- select cron.unschedule('reset-demo-data');
```
