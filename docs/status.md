# Project status and handoff

> Read this first when starting a new session. Update it at the end of every session (newest entry on top).

## 2026-10-22 (session stopped mid-Wave 1: handoff)

### Where things stand

- `main` = `7888ceb`. **Wave 0 is done**, and **W1-1, W1-2 and W1-3 are merged.** Each was reviewed (spec + quality) and fixed until clean.
- **New agents on `main`:** implementer, gate-checker, build-error-resolver, finding-verifier, consistency-reviewer, functional-tester, edge-case-hunter, test-automator. `tdd-guide` is retired. They resolve via `agentType` only in a fresh session.
- **finding-verifier passed its live hand-run.** It refuted a planted false finding with confidence 0.95, citing the guard in `utilization.ts`.
- **W1-4 (security docs + ECC guard hooks) is the only open Wave 1 ticket.**
  - Worktree: `../cc-1c-w1-4`, branch `feat/1c-w1-4-security-hooks`, last commit `702cb8f`.
  - Its Opus review found commit-hook bypasses and config-protection gaps.
  - Fix round 1 was **in progress, with uncommitted edits in that worktree**, when the session stopped.
  - The full findings and binding rulings are in `docs/agent-runs/2026-10-22-plan-1c-wave-0-1.md` (appendix), and locally in `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/task-W1-4-fix1-findings.md`.

### Resume steps (next session)

1. **Finish W1-4.**
   - In `../cc-1c-w1-4`, run `git status` and `git log --oneline main..HEAD`.
   - If the fix commit `fix(security): fail closed on unreadable commit messages` exists and the tree is clean, go straight to the scoped re-review.
   - If not, dispatch an implementer (Sonnet) in that worktree with the findings file and the uncommitted edits as a starting point. It should finish items A1–C14 test-first, then run `pnpm --filter @credit-coach/hooks test` and `pnpm verify && git status --porcelain`.
   - Then run a scoped re-review (Opus, using the reviewer's probe cases), then `git rebase main` in the worktree and `git merge --ff-only feat/1c-w1-4-security-hooks` from `main`.
   - **After this merge, config-protection is live.** It blocks agent edits to ESLint and Prettier configs, `.claude/settings*.json` and the 5 guard scripts.
2. **Post-Wave-1 integration fix on `main`** (rulings W1-b and W1-c). Do it before step 1's merge, because config-protection doesn't cover `package.json`. It's safe either way.
   - `apps/admin` `typecheck` becomes `next typegen && tsc --noEmit`. A fresh checkout fails without it, because `.next/types` is gitignored; CI and the fresh-clone check would fail too.
   - Raise the timeout in `.claude/hooks/tests/eslint-rules.test.mjs` (e.g. 30 s). It flakes under CPU load.
3. **Remove the merged worktrees and branches:**
   - `git worktree remove ../cc-1c-w1-1` (same for `-w1-2`, `-w1-3`, and `-w1-4` after it merges)
   - `git branch -d feat/1c-w1-1-build-agents feat/1c-w1-2-verify-agents feat/1c-w1-3-test-agents`
4. **Run a final whole-wave review of Wave 1** (Opus, `7caf31d..HEAD`). Then start **Wave 2 (W2-1, then W2-2), in a fresh session.**

### Carry-forwards for W2-1 (also in the plan and the "Residuals for W2-1" list below)

- **Add these schemas to the contracts block:**
  - `PROPOSAL_LIST_SCHEMA` `{name, layer, file, assertion, criterion}`
  - `LANDED_LIST_SCHEMA`
  - `QUARANTINED_LIST_SCHEMA`
  - `NOT_COVERED_LIST_SCHEMA` `{item, reason}`
  - `BOUNDARY_LIST_SCHEMA` `{category, verdict}`

  The exact shapes are in the W1-3 agent files.

- **`GATE_FACTS_SCHEMA` must accept gate-checker's `MODE: diff` output:** `facts.base` plus a top-level `diff` string.
- **`gateBrief` must emit exactly** `MODE: check <sha>` / `TEST: <cmd>|none` / `EXPECT: <paths>|none`.
- **W5-1:** add a CI commit-message lint, as a backstop for the commit hook.

### Owner actions still open

These are unchanged; see the list below. Also new: decide whether to commit or ignore `.design/`.

## 2026-10-22 (Wave 0 done)

### What landed

- **Plan 1c is committed (`d12f36c`) and approved by the owner.** Wave 0 ran on `main` with the owner's approval.
- **Wave 0 (W0-1 to W0-7) is complete**, plus a final-review fix wave on top of it:
  - Contracts (`.claude/hooks/lib/contracts.mjs`):
    - dedupe keys on `file|line|title` and never merges a security finding with a non-security one
    - `checkDrift(facts, task, expectedAttemptStart?)` adds `head-not-in-commits` and `attempt-start-mismatch`; a task with no test command and no test files expects the gate to run nothing
    - `wrapUntrusted` neutralizes forged BEGIN/END marker lines
    - the shared schemas and constants are deep-frozen
  - Agent lint: catches `- Nothing` and `**Nothing**`, enforces the `READ_ONLY_AGENTS` roster names, and detects the baseline heading outside fences only.
  - Plan parser: maps `dir/` to `dir/**` in `files` only, and uses the shared CommonMark fence detection.
  - Engine purity: ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket`, `process`, `globalThis`, bare `Date()`, `Math.random` and `net`/`path`/`os`/`crypto` imports, and `vitest.config.ts` is out of the engine `tsc` program, so `@types/node` no longer leaks in.
  - Workflows: a script under `.claude/workflows/` that doesn't match `*.workflow.js` fails the sync test.
  - Settings: more `.env*` read denies, `wget | bash` denied, `attribution.sessionUrl: false`.
  - Sonar: CPD skips the pasted contracts copies, and `scratch/**` is excluded.
  - Docs: the commit format in `docs/standards.md`, roster purposes in `.claude/rules/agents.md`, and the Maestro report path.
- **Plan 1c carry-forwards** (W1-1 `gate-checker` facts, W2-1 inferred test command and schema spike, W5-1 CI hardening) are written into the plan.

### Next step

- **Wave 1** (W1-1 to W1-4, parallel tickets; see Plan 1c).
- `.design/` is untracked on `main`, so a `/build` run on `main` stops at `dirty-start`. Run `/build` from worktrees, or the owner commits or ignores `.design/`.

### Residuals for W2-1, before it pastes the contracts block (from the Wave 0 fix-wave re-review)

- **Plan parser: glob tokens with `/` can widen `files` to the whole repo** (`**/*`), and globs can land in `createFiles`. No current plan does this. Reject root-anchored globs, and keep globs out of `createFiles` and `testFiles`, the same rule `isDirectory` already applies.
- **Plan 4a Tasks 6 and 8–10 list bare component filenames in `createFiles`,** so the gate would report them `missing:`. Fix the plan text, or teach the parser the `Create:` prefix directory, before W2-2.
- **`checkDrift`: a missing `head` plus a commit without `sha` passes `head-not-in-commits`** (`undefined === undefined`). Add `head` to the fail-closed facts.
- **The W1-1 gate-checker must echo `attemptStart` in its `MODE: check` facts,** or every attempt fails with `attempt-start-mismatch`.
- **Optional hardening:**
  - `wrapUntrusted` doesn't neutralize markers with a zero-width prefix or Unicode dashes
  - the engine lint misses `Math['random']` and `const { random } = Math`
  - `hasWriteOrEdit` ignores `MultiEdit` and `NotebookEdit`

### Owner actions still open

1. `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project`. The token has only `repo`, so nothing is pushed yet.
2. SonarQube Cloud: create the org `shubhamu55` and import `credit-coach`, turn off Automatic Analysis, and add the `SONAR_TOKEN` repo secret. Then set the repo variable `SONAR_REQUIRED=true` (W5-1).
3. `npx supabase login`, then create the free project `credit-coach` (Mumbai) and share its project ref.
4. Start Docker Desktop (needed by `api-tester` in Plan 3).
5. `npx eas-cli login` (optional).

## 2026-10-21 (end of session 2)

### What changed

- **Plan 1c written:** `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`. It is committed (`d12f36c`) and approved by the owner (see the 2026-10-22 entry).
  - It has 6 dependency waves and 24 tickets, and file ownership is disjoint within a wave.
  - Shared workflow logic lives in `.claude/hooks/lib/contracts.mjs`. Each workflow carries a byte-identical copy, and a test checks it.
  - The dry run on Plan 4a Task 2 moves up to Wave 2, before the second batch of agents.
  - G8 (`pr-review`) is a **commit status**, not a review: GitHub rejects approving your own PR.
- No owner blocker has been cleared yet. The ShubhamU55 token still has only `repo` scope, Docker isn't running, and Supabase isn't linked.

**Wave 0 progress (W0-7, last ticket):** agent lint, config audit, and scratch-header checks landed in `.claude/hooks/tests/` (`agents-lint.test.mjs`, `config-audit.test.mjs`, `scratch-headers.test.mjs`); `scratch/README.md` documents the §8.6 header format. All three checks were proven to bite (probe files added and removed) and `pnpm verify` is green on a clean tree. **Wave 0 is done; Wave 1 is next.**

### Next step

- **Owner:** review Plan 1c and choose how to execute it. _(Done: approved; see the 2026-10-22 entry.)_
- **Then:** Wave 1 (see Plan 1c for the ticket list; Wave 0's W0-1 through W0-7 are complete).
- **New owner action:** create the SonarQube Cloud org, turn off Automatic Analysis, and add the `SONAR_TOKEN` secret. See Plan 1c, "Owner actions".

## 2026-10-21 (end of session 1)

### Where things stand

| Item                                                   | State                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD                                                    | **Frozen v1.1**: `docs/PRD.md` (v1.1 gates planner step 4(b) behind the "Aim for 10% utilization" switch)                                                                                                                                                                                                                                                                   |
| Tech stack                                             | Approved: `docs/tech-stack.md`, ADR 0001                                                                                                                                                                                                                                                                                                                                    |
| UI design                                              | `docs/design.md` (v3 "Midnight") + `docs/design-mockups/v3/`                                                                                                                                                                                                                                                                                                                |
| **Agentic dev system design**                          | **Approved**: `docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md`. **Next step: write Plan 1c from it (superpowers `writing-plans`), as tickets designed for parallel sessions (spec §8.5)**                                                                                                                                                                   |
| Plan 1: Foundation                                     | Tasks 1, 2, 3, 4, 6, 7 **done**. Task 5 **partly done**: CI workflow and `supabase init` committed; repo push, Supabase link and EAS build are blocked on the owner. Task 8 (journal 000, README, fresh-clone check) is **pending the push**. Ledger: `.superpowers/sdd/2026-10-21-plan-1-foundation/progress.md` (local; copy it to `docs/agent-runs/` when Plan 1 closes) |
| Plan 4a: Mobile UI kit                                 | Written: `docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md`. **Not started.** It is the first feature to run _through_ the Plan 1c agent system                                                                                                                                                                                                                   |
| Plans 2 (engine), 3 (backend), 4b (screens), 5 (admin) | Not written yet                                                                                                                                                                                                                                                                                                                                                             |
| GitHub                                                 | Public repo **https://github.com/ShubhamU55/credit-coach** created, **nothing pushed yet**                                                                                                                                                                                                                                                                                  |

### Blockers (owner actions)

1. `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project`. The token currently has only `repo`, and the push was rejected because `ci.yml` needs the `workflow` scope.
2. `npx supabase login`, then create the free project `credit-coach` (Mumbai) and share its **project ref**.
3. `npx eas-cli login` (optional; the local release APK already works).
4. Docker Desktop must be running for local Supabase (API and RLS tests, spec §8.7).

### How to push without changing the active gh account

The owner's default `gh` account is the work account (ShubhamUpadhyay-Nibe). Push with the ShubhamU55 token for that one command only:

```bash
export TOK=$(gh auth token --user ShubhamU55)
git -c credential.helper= -c 'credential.helper=!f() { echo username=ShubhamU55; echo "password=$TOK"; }; f' push -u origin main
unset TOK
```

### Owner decisions to remember

- Judges weigh the **AI setup** more than the product idea. Treat the agent system as first-class.
- Money is **integer rupees**. **Security is a first-class gate.** **Reuse the maximum from affaan-m/ECC** (spec §14).
- PRs merge only through **agent PR review plus 9 merge gates** (spec §8.9).
- **Everything is committed.** Temporary files go in `scratch/` with an expiry (spec §8.6).
- Project management is a **GitHub Projects** board (spec §9).
- Commits have **no AI co-author or "Generated with" lines**.

### Environment notes

- **Emulator:** Pixel_7.
  - If adb shows `offline`, cold-boot with `-no-snapshot`.
  - Run `adb emu multidisplay del 1` (the AVD has a second display).
  - Dismiss any System UI "not responding" dialog.
  - Details are in the `maestro-android-e2e` skill.
- **Build times:** first release build ~13 min; incremental ~40 s. `nodeLinker: hoisted` is required (Windows path length).
