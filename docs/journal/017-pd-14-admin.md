# 017: PD-14, the thin admin control center

- **Date:** 2026-10-30
- **PRD refs:** section 6 (admin control center)
- **Run ledger:** [`docs/agent-runs/2026-10-30-pd-14.md`](../agent-runs/2026-10-30-pd-14.md)
- **Commits:** `git log a3cf6c5..feat/pd-14-admin`

## Goal

Build the part of the admin panel the demo needs, test-first and without a real backend: login, a rules editor whose
validation matches the database exactly, an audit log with a readable diff, and a read-only sample-profile list.

## What the AI did

- Read the migrations first and copied every CHECK range into one pure validator, then wrote the boundary tests (4/5/50/51 and
  the rest) before the validator existed (RED, then GREEN).
- Read the bundled Next 16 docs before writing code. The project has Cache Components on, so every read of the session cookie sits
  inside a Suspense boundary; the first production build failed on that and the fix came from the build error message.
- Wrote a small fake Supabase for Playwright that copies two real behaviours on purpose: a row-level-security refusal is a 200 with
  no rows, and a CHECK violation is a 400 with code 23514. This caught the "saved" trap: the action treats zero updated rows as a
  failure, and a unit test pins it.

## What I learned

- A refused UPDATE under RLS is silent. Any admin form that does not check the returned rows reports false success.
- `Number('')` is 0, so a form validator that parses first accepts an empty field as zero.
- A no-JavaScript test of a Suspense page is not possible: the streamed content stays hidden without scripts. The server path is
  covered by a unit test of the server action instead.

## Not done

Profile editing, the users list, the reset button, token refresh. See the ledger for each cost. Nothing ran against a real Supabase
project.
