# 007: PD-4 mobile app shell

- **Date:** 2026-10-28
- **PRD refs:** §5.1, §5.2 (navigation skeleton only)
- **Plan:** docs/superpowers/plans/2026-10-28-pd-4.md
- **Commits:** 3969eb7..fdd66be (plus the docs commit that adds this entry)

## Goal

A navigable Expo Router skeleton (Welcome, Home, Plan, Score, Mark-as-paid sheet), a typed in-memory demo repository seeded with Aarav, and a context for screens, so the screen streams (PD-8 to PD-10) can plug in without file conflicts.

## What the AI did

- Read `apps/mobile/AGENTS.md` and fetched the SDK 58 Expo Router docs (installation, modals) instead of using remembered APIs. Installed with `npx expo install`.
- Wrote the repository spec first and saw it fail (module missing), then wrote the smallest implementation. 21 tests pass.
- Built the router stubs with kebab-case testIDs and wrote a Maestro flow. This was a coordinator-dispatched session working by hand (no Workflow, no subagents, no planner second opinion).

## Tests added

Vitest: 21 in `apps/mobile/src/demo/repository.spec.ts`. Maestro: `onboarding-try-sample.yaml` written but not run (see below).

## Review findings & fixes

None yet: the coordinator runs the reviews after this session.

## Where AI was wrong / where I overrode it

- The first Vitest run failed on `extends: "expo/tsconfig.base"` (Vite's oxc transform needs a file extension). The fix is a config that disables the tsconfig lookup, with a typing cast.
- I could not get the release APK to build. Adding `expo-router` links safe-area-context and screens, and their CMake object paths exceed Windows' 260-character limit in this worktree. Excluding the unused optional peers (gesture-handler, reanimated, worklets) from autolinking and a `subst` drive did not fix it, and I reverted both. Roughly an hour went on this. The Maestro flow is therefore unverified, and the ledger says so.
- An early `pnpm verify` failed two `.claude/hooks` tests on 5 s timeouts while Gradle was building; the idle rerun passed. I treated that as load, not a code problem. The green run does not cover Android.

## What I learned

- Adding a native dependency can break the Windows release build through path length alone; check the APK build right after `expo install`, before writing screens.
- pnpm auto-installs optional peers, and Expo autolinking links everything in `node_modules`, not only what `package.json` lists.

## Time spent

A few hours wall-clock, a large share of it waiting on Gradle builds and the emulator, across a usage-limit interruption.
