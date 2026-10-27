# Credit Coach

[![CI](https://github.com/ShubhamU55/credit-coach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ShubhamU55/credit-coach/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ShubhamU55_credit-coach&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ShubhamU55_credit-coach)

These are live-status badges. They show nothing useful until `main` is pushed and SonarQube Cloud is set up (Plan 1c Wave 5).

**Your credit coach: what to pay, where, and when, every month.**

People in India with several credit cards, FDs and loans care about their CIBIL score but don't know what to do _this month_ to protect it. The bureau sees the balance that is **reported**: typically the statement balance, and since 2026 also weekly snapshots. It does not see what's left after you pay by the due date. That means someone who pays in full every month can still show high utilization.

Credit Coach turns your cards into a concrete monthly plan: which card to pay, how much, and by when. It also shows an estimated score range with the reasons behind it.

> Built solo for the Hack@FiftyFive "Build With AI" Hackathon 2026, with AI as the development partner.

## Repo map

| Path                      | What                                                     |
| ------------------------- | -------------------------------------------------------- |
| `docs/PRD.md`             | Product requirements (frozen v1). The source of truth    |
| `docs/tech-stack.md`      | Stack decision and risks                                 |
| `docs/superpowers/plans/` | Implementation plans                                     |
| `packages/engine`         | Pure TypeScript rules engine (planner, predictor, guard) |
| `apps/mobile`             | Android app (Expo / React Native)                        |
| `apps/admin`              | Admin control center (Next.js)                           |
| `supabase/`               | Database migrations and Edge Functions                   |

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

| Part   | Run                                                                                           | Test                                                                |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Engine | —                                                                                             | `pnpm --filter @credit-coach/engine test`                           |
| Admin  | `pnpm --filter @credit-coach/admin dev`                                                       | `pnpm --filter @credit-coach/admin test:e2e` (Playwright)           |
| Mobile | `pnpm --filter @credit-coach/mobile android:release` (standalone APK on the running emulator) | stop Metro, then `pnpm --filter @credit-coach/mobile e2e` (Maestro) |

### Environment files

Only `.env.example` files are committed. **Copy each to `.env.local` and fill it in by hand.** AI agents in this repo are blocked from writing `.env*` files by a hook (`.claude/hooks/protect-env.mjs`).

### Building the APK

- **Local:** `pnpm --filter @credit-coach/mobile android:release`. The APK is written to `apps/mobile/android/app/build/outputs/apk/release/`.
- **Cloud:** `cd apps/mobile && npx eas-cli build -p android --profile preview`.

If the emulator shows `offline` in `adb devices` after restoring a snapshot, cold-boot it: `emulator -avd Pixel_7 -no-snapshot`.

## AI-assisted development

This project was built with AI as the development partner. All of the evidence is in the repo:

- **[`docs/ai-system.md`](docs/ai-system.md) is the one-page overview for judges.** It covers the agentic delivery system: commands, workflows, agents and gates, the drift guard, retries and escalation, the verifier and token policies, and its known limits.
- [`CLAUDE.md`](CLAUDE.md) is the agent guide: workflow, ownership and non-negotiables.
- [`.claude/`](.claude/) holds the project's AI setup:
  - agents (analysis, build, test, review, bugs, ops)
  - Workflow scripts
  - skills (`credit-domain`, `maestro-android-e2e`, `process-journal`, plus curated ECC skills)
  - safety and format hooks
  - commands: `/feature`, `/build`, `/qa`, `/pr-review`, `/bugfix`, `/bug`, `/retro`, `/tidy`, `/worktrees`, `/verify` and `/journal`
- [`docs/agent-runs/`](docs/agent-runs/) holds the run ledgers: every review round, fix round and ruling.
- [`docs/adr/`](docs/adr/) records decisions, including [why we curated ECC instead of forking it](docs/adr/0002-curated-ai-dev-setup.md) and [how the agents are coordinated and gated](docs/adr/0003-agentic-delivery-system.md).
- [`docs/superpowers/plans/`](docs/superpowers/plans/) holds the implementation plans the AI executed.
- [`docs/journal/`](docs/journal/) is the process journal: what the AI did, the tests, the reviews, and where it was wrong.
