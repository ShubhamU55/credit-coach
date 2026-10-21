# 000: Brainstorm, frozen PRD and foundation

- **Date:** 2026-10-21
- **PRD refs:** whole document (v1 frozen)
- **Plan:** docs/superpowers/plans/2026-10-21-plan-1-foundation.md
- **Commits:** see `git log` from `761c340`

## Goal
Turn a broad first-draft PRD into a frozen, buildable spec. Then stand up a repo where every toolchain is proven end to end and the AI dev setup is project-owned.

## What the AI did

### Brainstorming (superpowers `brainstorming` skill)
- One question at a time: audience, the hackathon rules (from the brochure PDF), delivery target, scope tiers, admin panel, score predictor, data sourcing.
- **Repositioned** the idea from "tracker" to **"credit coach: what to pay, where, and when"**, because the market (CRED, OneScore, Paisabazaar, bank apps) already shows scores and dues.
- **Web research changed the product:**
  - Self-checks are soft inquiries and don't hurt the score (F1). The predictor is therefore pitched as "see it before the bureau does", not "checking hurts".
  - RBI moved to fortnightly (Jan 2025), then **weekly** (2026) bureau reporting (F2). The planner therefore targets reporting snapshots, and "reporting basis" became a configurable rule because the reported balance is unconfirmed (F3).
  - There is no public CIBIL API for individuals; Surepass offers a licensed-partner route (F5). That led to a swappable bureau connector with a demo provider as the default.
- **Scope tiers:** Core / Next / Future, plus a traceability table showing that nothing from the original PRD was silently dropped.
- **Builder check:** a fresh subagent read the PRD as if it had to build from it and raised 4 gaps:
  - payment tracking
  - which balance gets reported in weekly mode
  - judge access to the admin panel
  - the step-4 greedy order
  
  Three were settled as documented calls. One went to the owner (admin access for judges).

### Prior-art mining
- A subagent inventoried affaan-m/ECC (about 71 agents, 311 skills, 97 commands).
- Chose a **curated, project-owned subset** over a fork or a full install (ADR 0002). Reasons: context bloat, name collisions with superpowers and built-ins, slow default hooks, and nothing visible to judges.

### Stack (owner approved)
- TypeScript end to end: Expo, Next.js, Supabase, a shared pure engine; Vitest, Maestro and Playwright for tests (ADR 0001).

### Plan and execution
- superpowers `writing-plans` produced Plan 1. An advisor review caught 5 issues before execution:
  - pushing a fake key would trip GitHub push protection
  - the hook tests would never run under `pnpm -r`
  - manual Metro config is obsolete on SDK 52+
  - nothing verified that path-scoped rules load
  - the env hook would block `.env.local` creation, which must be documented
- Executed inline with superpowers `executing-plans`, keeping a ledger of every ruling.

## Tests added
- **Vitest:** engine `utilization` / `overallUtilization` (4 tests); hook path logic `isProtectedPath` / `isFormattable` (12 tests).
- **Playwright:** admin smoke test (heading plus an engine-computed value).
- **Maestro:** mobile smoke flow against a release APK with Metro stopped.
- **Live hook check:** a headless Claude session tried to write `apps/admin/.env.local` and was blocked by the hook with its reason.

## Where AI was wrong / where I overrode it
- `typescript@latest` resolved to **7.0** (the native port). typescript-eslint supports only < 6.1, so we pinned 6.0.
- `create-next-app` wrote a nested `pnpm-workspace.yaml`, and Next's `.gitignore` swallowed `.env.example`. Both were fixed.
- The emulator restored a stale snapshot and adb stayed `offline`. A cold boot (`-no-snapshot`) fixed it, and the fix is documented in the `maestro-android-e2e` skill.
- A Task 7 commit landed while `pnpm verify` was red, because the in-progress mobile app had no lint config yet. It was caught by reading the log and fixed in Task 4. It was never pushed.

## What I learned
- Freezing the PRD before choosing a stack paid off immediately: the weekly-reporting finding changed planner logic, not technology.
- Framework versions have moved past training data (Next 16, Expo SDK 58, TS 7). Both scaffolds now ship `AGENTS.md` files telling agents to read the bundled docs. Respect them.

## Time spent
About half a day, from brainstorm to a working foundation.
