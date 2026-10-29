# Credit Coach

[![CI](https://github.com/ShubhamU55/credit-coach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ShubhamU55/credit-coach/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ShubhamU55_credit-coach&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ShubhamU55_credit-coach)

These are live-status badges for `main`: CI (lint, typecheck, tests, secrets, dependency audit, CodeQL) and the SonarQube Cloud quality gate.

**Your credit coach: what to pay, where, and when, every month.**

People in India with several credit cards, FDs and loans care about their CIBIL score but don't know what to do _this month_ to protect it. The bureau sees the balance that is **reported**: typically the statement balance, and since 2026 also weekly snapshots. It does not see what's left after you pay by the due date. That means someone who pays in full every month can still show high utilization.

Credit Coach turns your cards into a concrete monthly plan: which card to pay, how much, and by when. It also shows an estimated score range with the reasons behind it.

> Built solo for the Hack@FiftyFive "Build With AI" Hackathon 2026, with AI as the development partner.

**Start with [`docs/submission.md`](docs/submission.md)**: the problem, who it is for, what was built and what was
cut, how AI was used, and an honest status table. The demo video shot list is
[`docs/demo-script.md`](docs/demo-script.md).

## Judge's quick-start

What is real, as of `origin/main` `23ba4be` (2026-10-29; the table in `docs/submission.md` section 3 is the live
version):

- **Real and tested on `main`:** the rules engine (payment planner, reporting dates, score range predictor,
  what-ifs, application guard, the "Why this plan?" template) and the mobile kit and app shell.
- **Built, not on `main` yet:** the Welcome, Home, Plan, Mark as paid and Score screens. Welcome and Home are PR #65
  (open) with a device report; Plan and Mark as paid (`feat/pd-9-plan`) have a device report on their branch; Score
  (`feat/pd-10-score`) has none yet. Until they merge, the app on `main` shows
  stub screens behind "Try sample profile".
- **Written, not deployed:** the Supabase backend and the `explain` Edge Function (branch `feat/pd-5-backend`). The
  app is built to work without it.
- **Not built:** bureau linking, the admin panel (it is still the stock Next scaffold), and sign-in. Reminders are built on
  a parked branch (`feat/pd-13-reminders`) and not part of the judged path.
- **No release APK is attached for judges yet.** The owner attaches it to a GitHub release (see the links table in
  `docs/submission.md`). Until then use track C to build it.

Pick a track:

**A. No install, 5 minutes.** Read [`docs/submission.md`](docs/submission.md), watch the demo video (link in that
file once recorded) or read [`docs/demo-script.md`](docs/demo-script.md), then skim
[`docs/ai-system.md`](docs/ai-system.md) and [`docs/journal/`](docs/journal/).

**B. Check the logic, about 10 minutes, Node only.**

```bash
git clone https://github.com/ShubhamU55/credit-coach && cd credit-coach
pnpm install --frozen-lockfile
pnpm --filter @credit-coach/engine test
```

Expect 255 passing tests and about 99.7% line coverage (the gate is 90%). The golden fixture is Aarav, from
`docs/design.md` section 8: `packages/engine/src/planner.golden.test.ts` asserts the exact plan, the 15.3% and 7.3%
outcomes, and the "admin demo moment" (threshold 20% makes the SBI step 14,400 and the left over 19,000).
`pnpm verify` runs lint, typecheck and every unit test in every workspace. When the machine is busy the `.claude/hooks` and
mobile suites can hit 5-second load timeouts; rerun a failing file alone to confirm. CI `verify` is the reference.

**C. Run the app, needs the Android SDK, JDK 17 and an emulator or a phone with USB debugging.**

```bash
pnpm install --frozen-lockfile
pnpm --filter @credit-coach/mobile android:release   # standalone release build, installs on the running device
```

On `main` you will see the Welcome stub, then a Home stub after "Try sample profile". The kit gallery (every
component) opens with `adb shell am start -a android.intent.action.VIEW -d creditcoach://kit`. To see the real screens,
check out the branches listed above (or wait for them to merge). The app needs no network and no account.
**Windows:** the native build fails on the 260-character path limit. Build from a short checkout path (for example
`C:\p\cc`) and add `externalNativeBuild { cmake { buildStagingDirectory "C:/b/cc" } }` to the generated
`android/app/build.gradle`, exactly as recorded in
[`docs/test-reports/maestro-2026-10-28-pd4-shell.md`](docs/test-reports/maestro-2026-10-28-pd4-shell.md).

If you can sideload an APK on a stock Android phone: enable "Install unknown apps" for your file manager or browser,
open the APK, install, then tap **Try sample profile**. This has not been tried on a stock phone with a release APK
from this repo yet; `docs/install.md` does not exist (that ticket, PD-6, was not started).

## Repo map

| Path                      | What                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `docs/submission.md`      | The submission write-up: problem, what was built and cut, how AI was used                     |
| `docs/demo-script.md`     | Shot list and voice-over for the demo video                                                   |
| `docs/PRD.md`             | Product requirements (frozen v1). The source of truth                                         |
| `docs/tech-stack.md`      | Stack decision and risks                                                                      |
| `docs/superpowers/plans/` | Implementation plans                                                                          |
| `packages/engine`         | Pure TypeScript rules engine (planner, predictor, guard)                                      |
| `apps/mobile`             | Android app (Expo / React Native)                                                             |
| `apps/admin`              | Admin control center (Next.js). **Stock scaffold only: the admin panel was cut**              |
| `supabase/`               | Database migrations and Edge Functions. **Only `config.toml` on `main`**; backend on a branch |

## Prerequisites (Windows 11 tested)

- Node ≥ 20, pnpm ≥ 9 (`npm i -g pnpm`), Git, GitHub CLI
- Android Studio with SDK + platform-tools (`adb`), JDK 17, and an emulator (API 34+)
- [Maestro](https://maestro.dev) CLI on PATH (for mobile E2E)
- Free accounts: Supabase, Vercel, Expo; an Anthropic API key (server-side only)

## Run locally

```bash
pnpm install          # hoisted node_modules (set in pnpm-workspace.yaml)
pnpm verify           # lint + typecheck + unit tests, every workspace
```

| Part          | Run                                                                                           | Test                                                                |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Engine        | —                                                                                             | `pnpm --filter @credit-coach/engine test`                           |
| Admin         | `pnpm --filter @credit-coach/admin dev` (the stock Next scaffold; the admin panel was cut)    | `pnpm --filter @credit-coach/admin test:e2e` (Playwright)           |
| Mobile        | `pnpm --filter @credit-coach/mobile android:release` (standalone APK on the running emulator) | stop Metro, then `pnpm --filter @credit-coach/mobile e2e` (Maestro) |
| Mobile (unit) | —                                                                                             | `pnpm --filter @credit-coach/mobile test` (Jest)                    |

### Environment files

Only `.env.example` files are committed. **Copy each to `.env.local` and fill it in by hand.** AI agents in this repo are blocked from writing `.env*` files by a hook (`.claude/hooks/protect-env.mjs`).

### Backend (optional, not deployed)

The app needs no backend: the sample profile is in memory and "Why this plan?" falls back to the engine's template.
The Supabase schema, row-level security and the `explain` Edge Function are written on the branch
`feat/pd-5-backend`, not merged and not deployed; its `supabase/OWNER-STEPS.md` lists the commands the owner runs
(link, push, set the `ANTHROPIC_API_KEY` function secret, deploy). The Anthropic key lives only in Supabase function
secrets, never in this repo.

### Building the APK

- **Local:** `pnpm --filter @credit-coach/mobile android:release`. The APK is written to `apps/mobile/android/app/build/outputs/apk/release/`.
- **Cloud:** `cd apps/mobile && npx eas-cli build -p android --profile preview`.

If the emulator shows `offline` in `adb devices` after restoring a snapshot, cold-boot it: `emulator -avd Pixel_7 -no-snapshot`.

## AI-assisted development

This project was built with AI as the development partner. All of the evidence is in the repo:

- **[`docs/ai-system.md`](docs/ai-system.md) is the one-page overview for judges.** It covers the agentic delivery system: commands, workflows, agents and gates, the drift guard, retries and escalation, the verifier and token policies, and its known limits.
- **[The Credit Coach project board](https://github.com/users/ShubhamU55/projects/1)** shows planning and execution: one issue per Plan 1c ticket (W0-1 to W5-2), grouped by wave, with the delivering commits and run ledgers linked. `scripts/pm/bootstrap-board.sh` creates the board, fields, milestones and labels idempotently.
- [`CLAUDE.md`](CLAUDE.md) is the agent guide: workflow, ownership and non-negotiables.
- [`.claude/`](.claude/) holds the project's AI setup:
  - agents (analysis, build, test, review, bugs, ops)
  - Workflow scripts
  - skills (`credit-domain`, `maestro-android-e2e`, `process-journal`, plus curated ECC skills)
  - safety and format hooks
  - commands: `/feature`, `/build`, `/qa`, `/pr-review`, `/bugfix`, `/bug`, `/retro`, `/tidy`, `/worktrees`, `/verify` and `/journal`
- [`docs/agent-runs/`](docs/agent-runs/) holds the run ledgers: every review round, fix round and ruling. The product phase (28 to 29 Oct) has one ledger per ticket (`2026-10-28-pd-<n>.md`) plus the coordinator's `2026-10-28-coordinator.md` with its rulings (the coordinator's file lands with its own branch).
- [`docs/submission.md`](docs/submission.md) section 4 says how the product phase actually ran (by hand under a coordinator, not through the `/build` Workflow), with the review and fix numbers and where each comes from.
- [`docs/adr/`](docs/adr/) records decisions, including [why we curated ECC instead of forking it](docs/adr/0002-curated-ai-dev-setup.md) and [how the agents are coordinated and gated](docs/adr/0003-agentic-delivery-system.md).
- [`docs/superpowers/plans/`](docs/superpowers/plans/) holds the implementation plans the AI executed.
- [`docs/journal/`](docs/journal/) is the process journal: what the AI did, the tests, the reviews, and where it was wrong.
