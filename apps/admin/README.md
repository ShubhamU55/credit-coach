# Credit Coach Admin

The thin admin control center (PRD section 6): sign in, edit the global coach rules, read the audit log and list the sample profiles. Next.js 16 (Cache Components) with Supabase Auth and PostgREST. Read `AGENTS.md` before changing framework code.

**Edits are global.** Rules apply to every user of the app. The audit log records who changed what.

## Run it

1. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the public anon key; there is no service-role key in this app).
2. Create an admin user. There is no self sign-up. In the Supabase dashboard: Authentication, Users, Add user (email and password, auto-confirm). Then set the role in the SQL editor:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
   where email = 'you@example.com';
   ```

   `app_metadata` can only be written with the service role, which is why the dashboard or SQL is the only way. `user_metadata` is never read. Sign in again after changing the role, because the role is in the access token.

3. `pnpm --filter @credit-coach/admin dev`, then open http://localhost:3000/login.

A signed-in user without the admin role sees "Not an admin" and cannot read or edit anything.

## Pages

- `/rules`: every editable `coach_rules` field. The browser and the server run the same `validateRules` (`src/lib/validation.ts`), which mirrors the database CHECK ranges. The save runs as the signed-in user, so row-level security is the real gate.
- `/audit`: the latest 50 `audit_log` rows with a before and after diff of the changed fields.
- `/profiles`: read-only `sample_profiles`. PAN and mobile render only when they have the masked shape.

The access token is kept in an httpOnly cookie for its lifetime (one hour by default); after that, sign in again. It is not refreshed.

## Known limits and deploy notes

- **Deferred (PRD wins):** creating and editing sample profiles, the users list, the "Reset demo data" button and the daily reset are not built. The PRD lists them, so the PR body and the submission say so.
- **Admin credentials stay owner-only** until a demo reset exists. Do not give judges the admin login: an edit is global and there is no one-click undo.
- **Deploy in production mode over HTTPS.** The session cookie is `secure` only when `NODE_ENV === 'production'`; plain `next dev` over http sends it unencrypted.
- **No login throttling in this app.** It relies on Supabase Auth rate limits; confirm the limits for the project in the dashboard (Authentication, Rate limits) before sharing the URL.
- **No token refresh.** After an hour, sign in again.
- **Validation is hand-rolled** (`validateRules`), not Zod: it mirrors the database CHECK ranges and is tested. This deviates from docs/standards.md on errors; no dependency was added.
- **Page-level gating.** Each data page checks `session.isAdmin` and issues no query for a non-admin; the layout alone is only a UI gate. Row-level security is still the real gate.
- **Errors.** A sign-in service outage shows "unavailable", not "signed out"; database error text is logged on the server and never shown to the browser.

## Tests

- `pnpm --filter @credit-coach/admin test` runs the Vitest unit tests.
- `pnpm --filter @credit-coach/admin test:e2e` builds and starts Next in production mode, plus a small fake Supabase (`e2e/fake-supabase.mjs`, port 54399), then runs Playwright. It never touches a real project.
