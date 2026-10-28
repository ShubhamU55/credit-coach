---
description: 'Run every verification layer that applies to the current changes and report PASS/FAIL per stage. Use before every commit or PR.'
allowed-tools: 'Bash(pnpm verify) Bash(pnpm --filter @credit-coach/admin test:e2e) Bash(git diff --name-only *) Bash(git status --porcelain) Bash(adb devices)'
---

Run these stages in order and report a table: stage, command, PASS/FAIL, key output line.

1. **Static + unit:** `pnpm verify` (lint, typecheck, and Vitest for engine and hooks).
2. **Admin E2E:** if `git diff --name-only main...HEAD` or the working tree touches `apps/admin/` or `packages/engine/`, run `pnpm --filter @credit-coach/admin test:e2e`.
3. **Mobile E2E:** if `apps/mobile/` or `packages/engine/` changed, tell the owner to run the release build and Maestro, per the `maestro-android-e2e` skill. If an emulator is attached (`adb devices` shows `device`), run them yourself: `pnpm --filter @credit-coach/mobile android:release`, stop Metro, then `pnpm --filter @credit-coach/mobile e2e`.
4. **Secrets:** confirm `git status --porcelain` lists no `.env` files (other than `.env.example`).

Use the `verification-loop` skill's report format. Don't summarise a stage as PASS unless you ran it in this session and read its output.
