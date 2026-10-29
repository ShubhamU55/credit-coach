# 006: PD-3, mobile UI kit part A (harness, tokens, primitives, buttons, forms)

- **Date:** 2026-10-28
- **PRD refs:** none directly; implements `docs/design.md` sections 2 to 6.3 and 6.10 to 6.12, and 10
- **Plan:** `docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md` (tasks 1, 3, 4, 5), run from `docs/superpowers/plans/2026-10-28-pd-3.md`
- **Commits:** `485ec1e` (task 1) .. `b8d6706`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-3.md`](../agent-runs/2026-10-28-pd-3.md)

## Goal

Give the other mobile streams a tested base: a Jest harness, the v3 design tokens copied from `design.md`, fonts, the `Text` and pop-press primitives, the three buttons, and the switch, choice rows and amount input. Task 1 was committed first and on its own because stream PD-7 waits on it.

## What the AI did

- One implementer session worked by hand, test-first, in its own worktree. The coordinator had turned off `/build` and sub-agents for this run, so there was no planner second opinion and no `design-checker`; the checklist was applied inline and written into the ledger.
- Read the RNTL v14 docs bundled in `node_modules` instead of using the v13 API from memory: `render` and `fireEvent` are async, and queries return host-element instances.
- Wrote a contrast guard that checks all 36 rows of the `design.md` 2.3 table twice: against the required ratio, and against the ratio the document prints. The second check catches a mistyped hex.

## Tests added

- Jest (`jest-expo`) in `apps/mobile`: 9 suites, 169 tests. Theme and contrast 88 (task 1), primitives 35, buttons 16, form controls 24, plus font loading and the raw-colour scan.
- No Maestro or Playwright changes. Engine untouched.

## Review findings & fixes

- No reviewer ran in this session; the coordinator reviews the diff afterwards.
- The task-1 raw-colour guard failed on `boxShadow: 'none'` in `PopPressable` after tasks 3 and 4 were committed. Fixed forward in `c5f5c51`.

## Where AI was wrong / where I overrode it

- Committed tasks 3 and 4 after running only their own test files, so a red guard test got into history for two commits. The pre-commit hook runs lint and typecheck, not Jest. Full mobile suite before every commit from now on.
- First `PopPressable` used the `Pressable` style callback; RNTL v14 could not trigger it with `fireEvent(..., 'pressIn')`, so it now holds the pressed state itself.
- The ticket says `src/kit/**`; the plan, standards doc and existing ESLint config say `src/ui/`. Followed the latter (ruling in the ledger).

## What I learned

- TypeScript 6 no longer picks up `@types/*` automatically; the test setup needs an explicit `types` list.
- pnpm 12 blocks `npx expo install` on unreviewed build scripts; the `allowBuilds` list in `pnpm-workspace.yaml` is where to answer that.
- Run the whole suite before committing when a repo-wide guard test exists.

## Time spent

About two hours of wall clock, including a usage-limit interruption.
