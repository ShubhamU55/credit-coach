# Coding standards

What lint and tests already enforce stays out of this file: engine purity, import boundaries,
the raw-hex ban, naming conventions (warn) and the 400-line/complexity size limits all run via
`eslint.config.mjs`, `eslint.shared.cjs` and the per-app configs — see those, not this file, for
exact rule text. This file holds only what a linter or test runner can't check.

## Layout

- `packages/engine/src/<domain>.ts` + `<domain>.test.ts` side by side, one module per domain
  concern (utilization, planner, reporting dates, predictor, guard).
- `apps/mobile/src/ui/{theme,primitives,components}/` for the presentational kit (doesn't exist
  yet; Plan 4a creates it, and composes its first screen, a kit gallery, into the existing
  `apps/mobile/App.tsx`). A dedicated `screens/` folder isn't defined; it should follow whichever
  later plan adds routing, not be invented here.
- `apps/mobile/.maestro/` for Maestro flows.
- `apps/admin/src/app/` for Next.js App Router pages; `apps/admin/e2e/` for Playwright specs.
- `supabase/migrations/` for SQL migrations, `supabase/seed.sql` for seed data (Supabase CLI
  defaults), `supabase/functions/<name>/` (one Edge Function per folder).

## Errors

- Engine functions return a typed value and never throw for an expected domain outcome. The
  shape is whatever the function needs — e.g. `utilization()` returns `number | null`, using
  `null` for the excluded/flagged case in PRD §5.2 — not a one-size-fits-all wrapper type.
- Boundaries (API routes, Edge Functions, form submission) validate with Zod before the engine
  ever sees the data; untrusted input is never passed through unchecked.

## Money and dates

- Amounts are **integer rupees** everywhere: engine, API, DB, UI. No floats for currency math.
- Inputs carrying paise (bureau import, manual entry) are **rounded half-up to whole rupees at
  the boundary**, and the rounding is surfaced to the user only if it changes a displayed number.
- Dates are `YYYY-MM-DD` strings. The engine never reads the clock; "today" is always a parameter.

## Components

- The mobile UI is a presentational kit (`theme/`, `primitives/`, `components/`) plus screens
  that compose it. Components receive already-computed, already-formatted values — no engine
  calls, no formatting of raw numbers inside a component.
- New **domain** boolean props use `is*`/`has*`/`show*` (e.g. `isPaid`, `hasWarning`,
  `showDisclaimer`). RN core prop names (`disabled`, `visible`, …) and props Plan 4a already
  approved are exempt and are not linted — this is a review convention, not an ESLint rule.

## testIDs

- Kebab-case, component-prefixed: `pop-button`, `plan-step-0`, `score-range`. One `testID` per
  interactive or asserted element; indices suffix repeated elements (`plan-step-0`, `plan-step-1`).

## Test naming

- Describe the observable behaviour, not the implementation: `returns null for zero, negative or
non-finite limit`, `sums across valid cards and excludes invalid limits` (both from
  `utilization.test.ts`). Arrange-Act-Assert inside the test body (see `.claude/rules/testing.md`).

## Commits and PRs

- Conventional commits: `<type>: <description>`, types `feat|fix|refactor|docs|test|chore|perf|ci`,
  subject ≤ 72 chars.
- No `Co-Authored-By` or "Generated with" lines on commits or PRs (CLAUDE.md rule 7).
- PR descriptions cover the full branch history (not just the latest commit) and include a test
  plan.

## Severity

One severity enum everywhere an agent reports a finding: `critical | high | medium | low`.
**Blocking** means `critical` or `high`. This maps the spec's envelope values: `important` →
`high`, `minor` → `medium`/`low` depending on impact.

## Golden examples

One reference file per kind. A better file replaces the example when it lands; "none yet" rows
point to the plan or task that will create the first one.

| Kind               | Path                                      |
| ------------------ | ----------------------------------------- |
| Engine function    | `packages/engine/src/utilization.ts`      |
| Engine test        | `packages/engine/src/utilization.test.ts` |
| Playwright spec    | `apps/admin/e2e/smoke.spec.ts`            |
| Maestro flow       | `apps/mobile/.maestro/smoke.yaml`         |
| UI component       | none yet: first lands in Plan 4a          |
| Component test     | none yet: first lands in Plan 4a          |
| Screen             | none yet: first lands in Plan 4a          |
| Supabase migration | none yet: first lands in Plan 3           |
| Edge Function      | none yet: first lands in Plan 3           |
