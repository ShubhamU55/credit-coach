# Test layers

Every layer below is owned by `test-automator` (`.claude/agents/test-automator.md`), which lands
accepted tester proposals into it. Testers (`functional-tester`, `edge-case-hunter`, `api-tester`,
`ui-tester`, `integration-tester`) propose; they never write a test file themselves. A proposal is
`{ name, layer, file, assertion, criterion }`, where `layer` is one of the values in the table
below.

| Layer                           | Tool                           | Location                                    | Command                                                                                      | Gate                                                                                                                                      |
| ------------------------------- | ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Engine unit tests               | Vitest (v8 coverage)           | `packages/engine/src/**/*.test.ts`          | `pnpm --filter @credit-coach/engine test`                                                    | CI `verify` job; ≥ 90% line coverage (`.claude/rules/testing.md`)                                                                         |
| Engine edge-case tests          | Vitest (deterministic)         | `packages/engine/src/**/*.edge.test.ts`     | `pnpm --filter @credit-coach/engine test`                                                    | CI `verify` job; same coverage gate as engine unit tests                                                                                  |
| Engine property tests           | fast-check                     | `packages/engine/src/**/*.property.test.ts` | `pnpm --filter @credit-coach/engine test`                                                    | CI `verify` job; same coverage gate as engine unit tests                                                                                  |
| Tooling tests                   | Vitest                         | `.claude/hooks/tests/**/*.test.mjs`         | `pnpm --filter @credit-coach/hooks test`                                                     | CI `verify` job                                                                                                                           |
| Admin E2E                       | Playwright                     | `apps/admin/e2e/**`                         | `pnpm --filter @credit-coach/admin test:e2e`                                                 | CI `admin-e2e` job (runs when `apps/admin/**` or `packages/engine/**` changed)                                                            |
| Mobile E2E                      | Maestro, against a release APK | `apps/mobile/.maestro/**`                   | `pnpm --filter @credit-coach/mobile e2e` (stop Metro first; see `maestro-android-e2e` skill) | CI `maestro-evidence` check: a junit report at `docs/test-reports/maestro-YYYY-MM-DD.xml` is required on any PR touching `apps/mobile/**` |
| Mobile component tests          | Jest (jest-expo)               | not yet created                             | not yet defined                                                                              | **Future — Plan 4a** adds this layer and wires it into `pnpm verify` and CI                                                               |
| Supabase API/RLS contract tests | not yet chosen                 | `supabase/tests/**` (not yet created)       | not yet defined                                                                              | **Future — Plan 3**, CI gate G3                                                                                                           |

## Notes

- **Engine coverage gate** (`.claude/rules/testing.md`, `docs/standards.md`): `packages/engine`
  must stay at ≥ 90% line coverage; `pnpm --filter @credit-coach/engine test` runs with
  `--coverage` (v8) already configured in `packages/engine/package.json`.
- **`pnpm verify`** (root `package.json`) runs lint, typecheck and every workspace's `test` script,
  so the engine, edge-case, property and tooling layers all run under it without a separate CI
  step. Admin E2E and mobile E2E run as their own CI jobs instead, because they need a browser or
  an emulator the `verify` job doesn't have.
- **Flaky-test quarantine**: `test-automator` is the only agent allowed to skip a landed test, and
  only with `it.skip('<name> (quarantined: see #<issue>)', ...)` — a linked issue number in the
  skip reason, never a silent or unexplained skip.
- **Evidence for judges** (CLAUDE.md, spec §8.6): Maestro reports and screenshots live in
  `docs/test-reports/`; Playwright's HTML report is uploaded as a CI artifact on failure
  (`.github/workflows/ci.yml`, `admin-e2e` job) rather than committed, since it's a generated
  report, not source evidence.
