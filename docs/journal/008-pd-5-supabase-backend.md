# 008: PD-5, Supabase backend and the `explain` function

- **Date:** 2026-10-28
- **PRD refs:** sections 5.1, 5.8, 6; non-negotiables 2, 3, 5, 6
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-5.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-5.md`](../agent-runs/2026-10-28-pd-5.md)

## Goal

Give the app and the admin panel a backend that keeps one user out of another's data, lets a judge try a sample profile with no sign-up, records who changed which coach rule, and serves a "Why this plan?" text that can never contain a number the engine did not compute.

## What the AI did

- One implementer session, by hand, test-first. Docker and the emulator were switched off to protect an evidence run, so the stack could not be started. I wrote the pgTAP RLS test first and then the migrations, then proved the SQL on a throwaway embedded Postgres 18 with a stubbed `auth` schema and a tiny pgTAP shim kept outside the repo. The real `supabase test db` run is handed to the owner and marked as not executed everywhere it is mentioned.
- Built the function as small pure modules (validation, template, grounding, prompt, model call, handler) with `fetch` and the key injected, so the whole contract and the 3-second limit run under Node with a mocked fetch. Only `index.ts` knows about Deno.
- Pinned the server's copy of the template to the engine's template with a fast-check property over personas, cash, threshold and the 10% switch, rather than importing across packages the deploy would not bundle.

## Tests added

- Vitest (`@credit-coach/supabase`, no Docker): 72 cases in 6 files. Seed personas and the Aarav golden plan (including the admin demo moment, 20% threshold giving SBI 14,400 and 19,000 left over), strict payload validation, template parity, grounding, handler contract, timeout, every fallback, log hygiene, static SQL and secret guards.
- pgTAP: `supabase/tests/database/rls.test.sql`, 115 checks (user A, user B, an anonymous sign-in user, an admin, the `anon` role, a direct session). Executed once on the embedded Postgres, **not** on the real local stack.

## Review findings & fixes

- No reviewer agent ran (coordinator override); the coordinator reviews the diff. Self-found defects are listed in the ledger.

## Where AI was wrong / where I overrode it

- My first `reset_demo_data()` allowed "a direct database session" by checking `session_user`. In the test harness the connection logs in as `postgres` and switches role with `SET ROLE`, so `session_user` stayed `postgres` and every caller passed; the RLS test caught it (2 of 115 failed). On Supabase proper the API connects as `authenticator`, so production may have been fine, but a check that depends on how the connection was opened is fragile; I replaced it with a check on the JWT role claim.
- The first card-name regex rejected Hindi combining marks; a test with a Devanagari name caught it.
- Two of my own static SQL checks matched comments instead of code; fixed by stripping comments.
- I almost asserted "tests pass" for the pgTAP file after running it only through my shim. It is recorded as one hand run on scratch tooling, with the real run listed as outstanding.

## What I learned

- A test that mutates the code under test (remove the grounding check, remove the timer race) is the quickest way to learn whether a timeout or grounding test really bites. Both mutations broke the expected tests.
- Putting seed data in a migration, not `seed.sql`, is what makes a hosted `db push` demo-ready.
- An Edge Function bundles only its own folder, so shared logic with the engine is a pinned copy plus a parity test, not an import.

## Time spent

One session; not timed. The live Anthropic call and the real-stack RLS run are still to do (`supabase/OWNER-STEPS.md`).
