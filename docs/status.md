# Project status and handoff

> Read this first when starting a new session. Update it at the end of every session (newest entry on top).

## 2026-10-26 (W2-2 done and merged — Wave 2 complete; a real pipeline defect was found and fixed)

### State at handoff — clean, nothing running

`main` is at `56b65c4`. `pnpm verify` is green (970/970 hooks tests, 30/30 engine at 98.76% line coverage, lint/typecheck clean across all workspaces). No worktree besides the main checkout; no agent running.

### What Plan 1c is and where it stands

- **Waves 0, 1 and 2 are all done and merged.** Wave 2 (W2-1 core workflows + W2-2 dry run) is Wave 2's last ticket — **Wave 3 is next** (the 4 remaining-agents tickets: W3-1 analyze agents, W3-2 API/UI/integration testers, plus whatever else Wave 3 names — read the plan's own Wave 3 section before starting).
- **W2-2 (dry run on Plan 4a Task 2) is done.** This was the first real exercise of `/build` on an actual task with injected faults, and it did its job: the fault-injection/retry mechanics worked exactly as designed, but the task-level review+fix-pass loop was caught silently overriding an approved plan's own explicit requirement, with zero human visibility, before this dry run looked closely at a small, low-risk task. Full history, every finding, and what's still deferred: `docs/agent-runs/2026-10-26-dry-run-plan-4a-task-2.md` and `docs/journal/001-agentic-system-dry-run.md`.

### The headline finding, so the next session doesn't have to re-derive it

Plan 4a Task 2's own acceptance test requires `maskPan('ABC')` to throw `RangeError`. The implementer built it correctly. `consistency-reviewer` then flagged the throw as "drift" from an unrelated golden example, two `finding-verifier` calls confirmed it **without ever seeing the plan's own text** (`reviewerPrompt`/`verifierPrompt` only ever carried a diff and a task title), and a fix pass changed the behavior to return `null` and **silently rewrote the plan's own acceptance test to match**. This is the exact "if code and the approved spec disagree, raise the conflict, don't silently pick one" failure CLAUDE.md's non-negotiables exist to prevent — except the pipeline itself did the silent picking. Caught, not shipped: surfaced to the owner via `AskUserQuestion` before any merge decision, reverted to the plan's throw, and — the actual fix — `reviewerPrompt`/`verifierPrompt` for task-level findings now carry the plan's own task text (trusted, unfenced, same status `implementerBrief` already gives it) with an explicit instruction not to confirm a finding that would override an explicit plan requirement. Two more real but smaller issues were found and fixed in the same pass: a QA-driven behavior change that shipped with zero test coverage (engine coverage had silently dropped 100%→93.8%), and a tester-accounting bug where a correctly-skipped `functional-tester` was counted as a failure (contradicting an explicit W1→W2-1 carry-forward). Commits: `33db799`, `6316f15`, `ae9c8fc` on the now-merged, now-deleted `feat/plan4a-t2-formatters` branch.

### Deferred, flagged for whoever picks up Wave 3 — read this before building new testers

**The identical plan-text gap still exists in `qa.workflow.js`'s `testerPrompt`/`verifierPrompt` and in `feature-build.workflow.js`'s QA-confirmed-findings fix pass.** No QA-phase tester has actually contradicted a plan yet (this run's `edge-case-hunter`/`security-reviewer` findings were all genuine gaps the plan never addressed), so this was explicitly deferred rather than fixed now — but it is the same structural risk, and Wave 3 adds more testers (`api-tester`, `ui-tester`, `integration-tester`) that will exercise this exact path. Worth fixing before or early in Wave 3, not after a second incident proves it necessary. Also minor and deferred: `stats.agents` undercounts (misses gate-checker/fault-injector calls), `stats.tokens` is hardcoded `null`, and one out-of-scope finding (a commit subject that deviated from the plan's exact wording — no bug-reporter exists yet to file it as a ticket, logged in the run ledger instead).

### Key files

- Full W2-2 run ledger and journal: `docs/agent-runs/2026-10-26-dry-run-plan-4a-task-2.md`, `docs/journal/001-agentic-system-dry-run.md`
- Plan text: `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md` (W2-2 ~lines 759-787; Wave 3 starts ~line 790)

## 2026-10-24 (W2-1 merged, qa.proposals fencing gap fixed — W2-2 unblocked)

### State at handoff — clean, nothing running

`main` is at `20ab88f`. `pnpm verify` is green (964/964 hooks tests, 4/4 engine at 100% coverage, lint/typecheck clean across all workspaces). No worktree besides the main checkout; no agent running.

### What Plan 1c is and where it stands

Plan 1c (`docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`) builds this repo's own agentic dev system in 6 waves (0-5); infrastructure for building the Credit Coach product faster afterward, not the product itself.

- **Waves 0 and 1 are done and merged.** Wave 1 took 6 fix rounds on W1-4 — see `docs/agent-runs/2026-10-23-plan-1c-wave-1.md`.
- **Wave 2, ticket W2-1** (`feature-build`/`qa` core orchestration workflows — the actual build/QA loop every later ticket's `/build`/`/qa` commands run through) is **done and merged**, after 5 fix rounds (the SDD skill's hard cap) each independently re-reviewed. Full ledger: `docs/agent-runs/2026-10-24-plan-1c-wave-2.md`.
- **The one gap flagged out of W2-1's scope (below) is now fixed and merged too (`20ab88f`).** Nothing is blocking **W2-2** (dry run on Plan 4a Task 2, plan lines ~759-780 — the first real exercise of `/build`) anymore.

### W2-1's history, compressed (full ledger: `docs/agent-runs/2026-10-24-plan-1c-wave-2.md`)

Implementation → task review found 5 Important bugs → **round 1** fixed them but introduced a new one (per-red-test fix passes, each blocked by every _other_ still-red test) → **round 2** batched correctly but its separate "revert" dispatch for refuted/out-of-scope tests was broken 4 ways → **round 3** unified removal into one batched dispatch/gate, but introduced 2 new Important bugs: (A) untrusted test `name`/`commit`/`file` spliced raw into a section labeled as a trusted instruction — a real injection shape; (B) removing the only test in a per-criterion file left a zero-test file, which Vitest fails outright, reopening the "poisoned batch" symptom a 3rd time → **round 4** (fresh Opus implementer, per the skill's escalation rule) fenced the removal list, added a `git cat-file`-gated empty-file-deletion rule, an ambiguous-match block, and a self-found path-safety guard — re-review found one more Important residual: the ambiguous-match rule had no contract guaranteeing a landed test's title actually equals its reported `name` → **round 5** (final, hard cap) closed that at its source with two one-line edits to `test-automator.md`, confirmed by a Sonnet-tier re-review (small, mechanical diff) as clean. Rebased, `pnpm verify` green, merged `--ff-only`, worktree/branch removed.

### qa.proposals fencing gap — fixed (`20ab88f`)

**What it was:** `feature-build.workflow.js`'s test-automator dispatch interpolated `JSON.stringify(qa.proposals, null, 2)` straight into the agent prompt with no `wrapUntrusted` call, even though tester proposals are the same untrusted-LLM-output category every other dispatch in this file fences (plan's Review Focus §5). Predated W2-1's fix rounds entirely; flagged for an owner decision rather than silently patched or silently merged past.

**Owner said: fix it.** Fixed test-first (RED confirmed: an injected instruction-like string leaked into the prompt's trusted/unfenced text; GREEN after the fix), wrapped the proposals JSON in `wrapUntrusted('PROPOSALS', ...)`, security-reviewer approved (no CRITICAL/HIGH, confirmed no other dispatch in the file was missed).

**While fixing it, found and fixed a second, unrelated pre-existing gap:** both workflow files (`feature-build.workflow.js`, `qa.workflow.js`) have always had 14-18 real ESLint errors (Workflow-tool runtime globals `agent`/`log`/`parallel`/`workflow`/`args` read as `no-undef`; several pasted-contracts-block schemas/helpers read as unused) — invisible until now only because the commit-quality hook skips linting when `node_modules/.bin/eslint` is absent, true in every prior worktree-based commit to these files (worktrees don't get their own install) and false once committing from the main checkout, which has node_modules. Per git-workflow.md's "investigate and fix the underlying issue, don't `--no-verify`" rule: fixed in the source (not the protected `eslint.config.mjs`, which `config-protection.cjs` correctly blocked editing) via `/* global ... */` declarations and a disable/enable pair that brackets — but sits outside — the `<contracts>...</contracts>` markers, so the byte-identical-paste sync test (`workflows-sync.test.mjs`) still passes. Confirmed both workflow files lint clean and the sync test still passes.

### Key files (all paths relative to repo root)

- Plan text: `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md` (Task W2-1 ~lines 663-758; Review Focus lines 59-74; W2-2 ~lines 759-780)
- Full W2-1 run ledger (all 5 rounds, every ruling with cost-if-wrong): `docs/agent-runs/2026-10-24-plan-1c-wave-2.md`
- Live SDD working files (findings per round, implementer reports, diff packages): `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/` — `task-W2-1-fix1-findings.md` through `fix5-findings.md`, `task-W2-1-report.md` (all 5 rounds appended), `progress.md` (search `## Wave 2`)

### Owner actions still open (unchanged; not blocking Wave 2)

- `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project` — token still has only `repo`.
- SonarQube Cloud org/import/`SONAR_TOKEN`/`SONAR_REQUIRED` (W5-1).
- `npx supabase login` + create the project.
- Docker Desktop (needed by `api-tester`, Plan 3 — not yet built).
- When convenient: toggle `config-protection` off briefly to fix the 5 locked-file security gaps (see the Wave-1-complete entry below for the list).
- Decide whether to commit or `.gitignore` `.design/` (still untracked on `main`).

## 2026-10-23 (session stopped: context filled, mid-Wave-2 W2-1 — fix round 3 clean)

### State at handoff — safe, no live writer

Unlike an earlier draft of this entry, the worktree is now in a **clean, settled state**: the implementer that was mid-edit has finished, committed, and the session independently re-verified it. **No agent is running.** `git -C ../cc-1c-w2-1 status --porcelain` is empty, `git -C ../cc-1c-w2-1 log --oneline -1` is `ee8b9e7`, and `pnpm --filter @credit-coach/hooks test` was re-run from scratch by the controller (not just trusted from the implementer's report): 948/948 passing. It is safe to pick this up directly — no collision-detection steps needed before starting (still worth a quick `ListAgents`/`git status` sanity check as a matter of habit, but this is not the live-risk situation an earlier version of this entry described).

### What Plan 1c is and where it stands

Plan 1c (`docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`) builds this repo's own agentic dev system — custom Claude Code agents, hooks, and now Workflow-tool orchestration scripts — in 6 waves (0–5). This is itself the subject of the plan; it is infrastructure for building the actual Credit Coach product faster and more reliably afterward, not the product.

- **Waves 0 and 1 are done and merged to `main`** (`main` = `e039d8f` as of this entry). Wave 1 took 6 fix rounds on one ticket (W1-4, the security commit-hook) — see `docs/agent-runs/2026-10-23-plan-1c-wave-1.md` for the full ledger if you need that history; you shouldn't need it for Wave 2 work.
- **Wave 2, ticket W2-1** (`feature-build`/`qa` core orchestration workflows) is **in progress, not merged**, in worktree `../cc-1c-w2-1` on branch `feat/1c-w2-1-core-workflows`, currently at `ee8b9e7`. This is the big one: it's the actual build/QA loop every later ticket's `/build`/`/qa` commands will run through.
- **W2-1 has gone through an initial implementation, a task review, and 3 complete fix rounds** (the 3rd just finished and was independently re-verified by the controller). This is **round 3 of a 5-round cap** per the `subagent-driven-development` skill's fix-loop rule. **Round 3 has not yet been re-reviewed** — that's the very next step, not yet done.

### W2-1's history, in one paragraph, for orientation (full detail is in the files listed under "Key files")

Implementation (`97602dc`, `7a7f037`) built the contracts extensions, `plan-tasks.mjs` glob-safety fix, both workflow files, and both slash commands. Task review (opus) found the contracts/schema work solid but 5 Important runtime bugs in the orchestration bodies (testers never received `base`/`head` on real paths, both fix-passes used the wrong gate range causing spurious escalation or silent-pass bugs, QA's confirmed findings were dropped entirely, untrusted finding text wasn't fenced before a verifier prompt, and a glob-rejection had a real bypass). **Fix round 1** (`d9e710f`, `797b41f`) fixed all of those correctly, confirmed by re-review — but its own restructuring of the QA-confirmed-red-test fix pass (one pass per red test) introduced a new bug: each pass's gate includes the mandatory `pnpm verify`, which still covers every _other_ unfixed red test, so the first pass's gate could never fully pass with ≥2 confirmed red tests. **Fix round 2** (`2af292b`) batched the red-test fixes into one dispatch correctly, but the mechanism it added for _removing_ refuted/out-of-scope red tests (a separate "revert" dispatch) was broken 4 ways, all reintroducing some version of the same "poisoned batch" symptom (the revert instruction gets swallowed by an untrusted-text fence; the revert commit is never gated; it can delete the wrong test in a shared file; out-of-scope routing still leaves a red test committed to poison the shared `pnpm verify`). **Fix round 3** (`ee8b9e7`, DONE) unified this: folded test removal into the _same_ single batched dispatch and gate the confirmed fixes already use, with a trusted (unfenced) instruction naming exactly which test cases to remove by description and commit sha. The implementer's report (see `task-W2-1-report.md`, "Fix round 3 report") describes all 4 of round 3's own findings-file test scenarios as implemented with real harness-driven tests (not success-assuming mocks), plus a regression check confirming 6 of the new tests fail for the right reasons against the pre-fix (`2af292b`) code. This has NOT yet been independently re-reviewed by a fresh Opus pass — that's unverified-by-review, only independently spot-checked by the controller (clean tree + full suite re-run).

### Resume steps (next session) — start here

1. **Dispatch the round-3 scoped re-review.** Generate the review package: `bash C:\Users\55\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\subagent-driven-development\scripts\review-package docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md 2af292b ee8b9e7` (the `7.0.0` version segment may have changed since this was written; `ls C:\Users\55\.claude\plugins\cache\claude-plugins-official\superpowers\` to confirm first). Dispatch a scoped Opus re-review against `task-W2-1-fix3-findings.md`'s 4 required scenarios — the exact dispatch-prompt shape used for rounds 1 and 2 is in `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/progress.md` (search `## Wave 2`); round 3's prompt should look substantively the same, just pointed at `task-W2-1-fix3-findings.md` and the `2af292b..ee8b9e7` diff.
2. **At the cap:** this is round 3 of 5. If the re-review comes back clean, proceed to merge: rebase the worktree onto current `main`, confirm `pnpm verify` green post-rebase, `git merge --ff-only` from `main` — exactly how every Wave 1 ticket merged. If the re-review finds more, decide per the SDD skill whether a round 4 is warranted (a narrow bugfix in round 3's own new code only, no new design) or whether to adjudicate/park what's left — you'll have fresh context from reading round 3's own re-review, so this is your call to make at that point.
3. **After W2-1 merges:** remove the worktree (`git worktree remove ../cc-1c-w2-1`) and branch (`git branch -d feat/1c-w2-1-core-workflows`), same cleanup pattern as Wave 1. Then **W2-2** (the dry run on Plan 4a Task 2, plan lines ~759-780) is next — it's the first real exercise of the `/build` command this ticket builds, and its own plan text expects W2-1's loop to actually work correctly on a real task, which is exactly what all 3 fix rounds have been chasing.
4. **Update this file again** when you stop, per the standing rule — newest entry on top, same as this one.

### Key files (all paths relative to repo root `C:\Users\55\credit-coach`, except the worktree itself)

- Plan text: `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md` (Task W2-1 is lines ~663-758; Global Constraints lines 32-74; Review Focus lines 59-74)
- W2-1's original brief (plan text extracted): `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/task-W2-1-brief.md`
- Carry-forwards given to the original implementer (contracts/schema requirements, the spike's allOf-at-schema-root constraint, Wave-1-review carry-forwards): `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/task-W2-1-carry-forwards.md`
- Fix round findings: `task-W2-1-fix1-findings.md`, `task-W2-1-fix2-findings.md`, `task-W2-1-fix3-findings.md` (same directory) — all 3 are self-contained briefs, written assuming the reader has none of this session's context
- Implementer's full report, every round appended: `task-W2-1-report.md` (same directory; "Fix round 3 report" is the newest/last section)
- Full session ledger with every ruling, review verdict, and the exact dispatch history: `.superpowers/sdd/2026-10-21-plan-1c-agentic-system/progress.md` — search for `## Wave 2` near the end; everything after that heading is this session's W2-1 work, in order, ending with a "Session stop" entry confirming the clean final state
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
