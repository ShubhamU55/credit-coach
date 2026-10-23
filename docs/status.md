# Project status and handoff

> Read this first when starting a new session. Update it at the end of every session (newest entry on top).

## 2026-10-23 (session stopped: context filled, mid-Wave-2 W2-1 handoff)

### Read this before touching anything — a live collision risk, same shape as the one this session already hit once

This session (its name is `credit-coach-d3`, if your harness exposes peer-session names) is stopping because its context filled up, **not because the work finished**. At the moment this entry was written, an implementer subagent dispatched by this session was **still actively running** inside the worktree `../cc-1c-w2-1`, mid-edit on `feature-build.workflow.js` (uncommitted). This session may or may not still be alive and reachable by the time you read this.

**Before you dispatch anything into `../cc-1c-w2-1` or edit any file there yourself:**

1. Run `ListAgents`. If a session named `credit-coach-d3` appears as a peer (not idle, or even if idle), **send it a message first** asking whether its implementer subagent is done and what state the worktree is in. Do not assume it's gone just because this conversation has ended from the user's point of view.
2. Regardless of what `ListAgents` shows, run `git -C ../cc-1c-w2-1 log --oneline main..HEAD` and `git -C ../cc-1c-w2-1 status --porcelain` yourself. **Git state is the only fully reliable source of truth here, not this writeup** — the implementer may have finished and committed after this entry was written, or it may still be mid-edit, or (if its session died mid-tool-call) its edit may be abandoned uncommitted.
   - If `HEAD` is a commit **after** `2af292b` (see below for what that means): fix round 3 completed and committed. Skip straight to "Resume steps," step 2.
   - If `HEAD` is still `2af292b` and the tree is **clean**: the round-3 implementer either never started or was cleanly stopped before editing. Treat round 3 as not yet dispatched; see "Resume steps," step 1.
   - If `HEAD` is still `2af292b` and the tree is **dirty**: an implementer was (or still is) mid-edit. This is exactly the situation a prior session in this same project hit with ticket W1-4 (see the 2026-10-22 entry below, and `docs/agent-runs/2026-10-23-plan-1c-wave-1.md`'s "Session resume" section for the full story of how that collision was resolved) — **do not reset, discard, or blindly build on top of it.** First rule out a live writer (step 1 above). If none is found, read the diff (`git -C ../cc-1c-w2-1 diff`) against `task-W2-1-fix3-findings.md` (path below) to judge whether it's safe, in-progress, legitimate work to finish, and proceed the way the 2026-10-22 entry's resolution did: inspect, don't guess, and keep whatever real work is there rather than discarding it.

### What Plan 1c is and where it stands

Plan 1c (`docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`) builds this repo's own agentic dev system — custom Claude Code agents, hooks, and now Workflow-tool orchestration scripts — in 6 waves (0–5). This is itself the subject of the plan; it is infrastructure for building the actual Credit Coach product faster and more reliably afterward, not the product.

- **Waves 0 and 1 are done and merged to `main`** (`main` = `aee5462` as of this entry). Wave 1 took 6 fix rounds on one ticket (W1-4, the security commit-hook) — see `docs/agent-runs/2026-10-23-plan-1c-wave-1.md` for the full ledger if you need that history; you shouldn't need it for Wave 2 work.
- **Wave 2, ticket W2-1** (`feature-build`/`qa` core orchestration workflows) is **in progress, not merged**, in worktree `../cc-1c-w2-1` on branch `feat/1c-w2-1-core-workflows`. This is the big one: it's the actual build/QA loop every later ticket's `/build`/`/qa` commands will run through.
- **W2-1 has gone through an initial implementation + task review + 2 complete fix rounds, and fix round 3 was just dispatched** (see "A live collision risk" above for its exact status as of writing). This is **round 3 of a 5-round cap** per the `subagent-driven-development` skill's fix-loop rule — if round 3's own re-review still finds something open, the next session needs to make a judgment call (continue to round 4, or adjudicate/park per the skill's "breaker" rule) rather than assuming an automatic round 4.

### W2-1's history, in one paragraph, for orientation (full detail is in the files listed under "Key files")

Implementation (`97602dc`, `7a7f037`) built the contracts extensions, `plan-tasks.mjs` glob-safety fix, both workflow files, and both slash commands. Task review (opus) found the contracts/schema work solid but 5 Important runtime bugs in the orchestration bodies (testers never received `base`/`head` on real paths, both fix-passes used the wrong gate range causing spurious escalation or silent-pass bugs, QA's confirmed findings were dropped entirely, untrusted finding text wasn't fenced before a verifier prompt, and a glob-rejection had a real bypass). **Fix round 1** (`d9e710f`, `797b41f`) fixed all of those correctly, confirmed by re-review — but its own restructuring of the QA-confirmed-red-test fix pass (one pass per red test) introduced a new bug: each pass's gate includes the mandatory `pnpm verify`, which still covers every _other_ unfixed red test, so the first pass's gate could never fully pass with ≥2 confirmed red tests. **Fix round 2** (`2af292b`) batched the red-test fixes into one dispatch correctly, but the mechanism it added for _removing_ refuted/out-of-scope red tests (a separate "revert" dispatch) was broken 4 ways, all reintroducing some version of the same "poisoned batch" symptom (the revert instruction gets swallowed by an untrusted-text fence; the revert commit is never gated; it can delete the wrong test in a shared file; out-of-scope routing still leaves a red test committed to poison the shared `pnpm verify`). **Fix round 3** (dispatched, status per above) unifies this: fold test removal into the _same_ single batched dispatch and gate the confirmed fixes already use, with a trusted (unfenced) instruction naming exactly which test cases to remove.

### Resume steps (next session)

1. **If round 3 was never dispatched, or was cleanly abandoned with a clean tree:** resume the same implementer agent if your harness can still reach it by the agent ID `a12ada87322d0244a` (unlikely to resolve in a new session — agent IDs are typically scoped to the session that spawned them). More likely you'll need to **dispatch a fresh implementer** into `../cc-1c-w2-1` (branch `feat/1c-w2-1-core-workflows`, currently at `2af292b`) using the findings in `task-W2-1-fix3-findings.md` (full path below) as its brief — that file is a complete, self-contained fix-round brief; it doesn't assume the reader has this session's context. Use the `subagent-driven-development` skill's fix-loop guidance (rounds 1-3 resume the same implementer when possible; since you likely can't resume the same agent across sessions, dispatching fresh here is fine and expected — just give it the findings file and tell it the worktree is already on the right branch at the right commit).
2. **Once round 3 has a commit:** generate the review package (`bash <superpowers-plugin-path>/skills/subagent-driven-development/scripts/review-package docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md 2af292b <round-3-head-sha>`) and dispatch a scoped Opus re-review, same pattern as the prior 2 rounds (see the ledger for the exact dispatch-prompt shape used each time — they're all substantively similar, just update the findings-under-verification list to match `task-W2-1-fix3-findings.md`'s 4 test scenarios).
3. **At the cap:** this is round 3 of 5. If round 3's re-review comes back clean, proceed to merge (rebase the worktree onto current `main`, `pnpm verify` green, `git merge --ff-only` from `main`, matching exactly how every Wave 1 ticket merged). If it finds more, decide per the SDD skill whether round 4 is warranted (a narrow bugfix in round 3's own new code) or whether to adjudicate/park what's left — you have more context fresh from reading round 3's re-review than this entry can give you, so this is your call to make at that point, not a decision to defer back further.
4. **After W2-1 merges:** remove the worktree (`git worktree remove ../cc-1c-w2-1`) and branch (`git branch -d feat/1c-w2-1-core-workflows`), same cleanup pattern as Wave 1. Then **W2-2** (the dry run on Plan 4a Task 2, plan lines ~759-780) is next — it's the first real exercise of the `/build` command this ticket builds, and its own plan text expects W2-1's loop to actually work correctly on a real task, which is exactly what all 3 fix rounds have been chasing.
5. **Update this file again** when you stop, per the standing rule — newest entry on top, same as this one.

### Key files (all paths relative to repo root `C:\Users\55\credit-coach`, except the worktree itself)

- Plan text: `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md` (Task W2-1 is lines ~663-758; Global Constraints lines 32-74; Review Focus lines 59-74)
- W2-1's original brief (plan text extracted): `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/task-W2-1-brief.md`
- Carry-forwards given to the original implementer (contracts/schema requirements, the spike's allOf-at-schema-root constraint, Wave-1-review carry-forwards): `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/task-W2-1-carry-forwards.md`
- Fix round findings: `task-W2-1-fix1-findings.md`, `task-W2-1-fix2-findings.md`, `task-W2-1-fix3-findings.md` (same directory)
- Implementer's full report, every round appended: `task-W2-1-report.md` (same directory, ~520 lines as of this entry)
- Full session ledger with every ruling, review verdict, and the exact dispatch history: `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/progress.md` — search for `## Wave 2` near the end; everything after that heading is this session's W2-1 work, in order
- The worktree itself: `C:\Users\55\cc-1c-w2-1` (branch `feat/1c-w2-1-core-workflows`)

### Owner actions still open (unchanged from the 2026-10-23 Wave-1-complete entry below; not blocking Wave 2)

- `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project` — token still has only `repo`.
- SonarQube Cloud org/import/`SONAR_TOKEN`/`SONAR_REQUIRED` (W5-1).
- `npx supabase login` + create the project.
- Docker Desktop (needed by `api-tester`, Plan 3 — not yet built).
- When convenient: toggle `config-protection` off briefly to fix the 5 locked-file security gaps listed in the Wave-1-complete entry below (`eslint.shared.cjs` protection, worktree-scope decision, `${CLAUDE_PROJECT_DIR}`/`onFailure:block`, PowerShell hook coverage, the 800-line header on `pre-bash-commit-quality.cjs`).
- Decide whether to commit or `.gitignore` `.design/` (still untracked on `main`; harmless but has shown up as noise in every `git status` this whole project).

## 2026-10-23 (Wave 1 complete)

### Where things stand

- `main` = `0f05010`. **Wave 0 and Wave 1 are both done and merged.** The 4 Wave 1 worktrees and branches are cleaned up.
- **W1-4** (security docs + ECC guard hooks) took **6 fix rounds** (5 numbered + one breaker-ruling cleanup) chasing increasingly narrow commit-hook bypasses, each independently re-reviewed on Opus. It converged: a 3-tier command-detection model, a word-level `GIT_CONFIG_*` check, a positive `gh`-subcommand allowlist, and `config-protection.cjs` with real-file-identity comparison. Full history: `docs/agent-runs/2026-10-23-plan-1c-wave-1.md`.
- **Post-Wave-1 integration fix landed on `main` first** (rulings W1-b/W1-c, commit `8d9f8ae`): `apps/admin` `typecheck` = `next typegen && tsc --noEmit` (fixes a fresh-checkout failure — `.next/types` is gitignored); `eslint-rules.test.mjs`'s test timeout raised to 30s (CPU-load flakiness).
- **Two unrelated commits** (`dc7c00d`, `3e1dc76`) removed `LICENSE`/`THIRD_PARTY_NOTICES.md` — an owner decision, not part of Plan 1c.
- **The Wave 1 final whole-wave review (opus) found real, non-blocking gaps**, now fixed where cheap (doc wording in `.claude/rules/agents.md`, `development-workflow.md`, `testing.md`, this entry) or carried forward below:
  - **Not fixed, carried forward — locked files, needs config-protection toggled off to touch:**
    - `eslint.shared.cjs` (holds the actual ESLint rules all 3 flat configs import, including the engine-purity rules) is **not** protected by `config-protection.cjs` — its pattern only matches `eslint.config.*`, not `eslint.shared.cjs`. `consistency-reviewer.md` names it as a lint source of truth.
    - `config-protection.cjs`'s guard-script/settings protection resolves against the hook's own `__dirname` and (for the identity fallback) inode — so it only protects **the checkout the running hook lives in**, not a sibling worktree's copy. Waves 3-4 run one session per worktree; a worktree session can edit the main checkout's `settings.json`/guard scripts, or vice versa, and an ff-merge would carry it to `main`. Backstop: the W2-1 drift guard, only for implementer-path edits.
    - Both Wave 1 hooks (`pre-bash-commit-quality.cjs`, `block-no-verify.cjs`, and pre-existing `protect-env.mjs`) register with relative `node .claude/hooks/...` paths and **fail open (exit 1, non-blocking) when the session's cwd isn't the repo root** — confirmed live from a subdirectory. Should use `${CLAUDE_PROJECT_DIR}` and/or `"onFailure": "block"`.
    - **Only the `Bash` tool is hooked — the `PowerShell` tool is not.** On this host (Windows, PowerShell primary), `git commit --no-verify` with an attribution line through the PowerShell tool passes every Wave 1 guard undetected. Not disclosed in the security docs; no ruling covers it.
    - `pre-bash-commit-quality.cjs` (1739 lines) is missing the plan's required `Vendored from ECC; exempt from the 800-line ceiling` header that `block-no-verify.cjs` has.
  - **Carried into the W2-1 brief (not yet in this file before now):**
    - W1-3's testers (`functional-tester`, `edge-case-hunter`) will block on every `/qa` run as currently specified — they require a `<base>..<head>` and (for `functional-tester`) acceptance criteria, but the plan's `qa` workflow args (`{ scope, changedFiles, diff, criteria? }`) don't guarantee either. W2-1 must pass `gate-checker`'s `MODE: diff` `base`/`head` into every tester brief, and either require `criteria` or skip `functional-tester` when none are given (logged as not-applicable, not a block).
    - `implementer`/`build-error-resolver`'s output schema requires `commit` even on `status: blocked`, which has no commit — a blocked result currently fails schema validation and silently loses its `blockedReason`. Make `commit` nullable, or required only when `status: done`.
    - No rule yet covers the commit hook (W1-4) rejecting the `implementer`'s brief-mandated exact commit message (over 72 chars, a stray backtick/`$`, "generated with" appearing innocently in a body). `implementerBrief` should pre-check with `checkCommitMessage` before committing.
  - **Noted, not load-bearing:** `test-automator`'s allowed paths include the files that hold its own gates (`packages/engine/vitest.config.ts`'s coverage threshold, `.github/workflows/**`, `.claude/hooks/tests/**`) — nothing but a prompt line stops it weakening them; worth a pinned test asserting the threshold stays ≥ 90 at some point.

### Next step

- **Wave 2** (W2-1, then W2-2) — fresh session. W2-1 must incorporate the carry-forwards above (testers' base/head + criteria handling, nullable `commit` on blocked, commit-message pre-check) in addition to the existing "Residuals for W2-1" list below (unchanged, still open).
- **Owner, when convenient** (not blocking Wave 2): toggle `config-protection` off briefly to fix the 5 locked-file items above (`eslint.shared.cjs` protection, worktree-scope decision, `${CLAUDE_PROJECT_DIR}`/`onFailure:block`, PowerShell hook coverage, the 800-line header) as one batch, then re-enable.

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
