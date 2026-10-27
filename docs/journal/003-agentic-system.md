# 003: Plan 1c Wave 4. The pipeline workflows, and the fail-open gates review caught

- **Date:** 2026-10-27
- **PRD refs:** none. Plan 1c builds the repo's own agentic dev system, not the product.
- **Plan:** docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md (Wave 4, tickets W4-1..W4-5)
- **Commits:** `c84e390..fd7f0a6` (W4-1..W4-4), then on the W4-5 branch the Wave 4 ledger, the docs commits and the review-fix commit
- **Run ledger:** [`docs/agent-runs/2026-10-27-plan-1c-wave-4.md`](../agent-runs/2026-10-27-plan-1c-wave-4.md). Design summary: [`docs/ai-system.md`](../ai-system.md). Decisions: [ADR 0003](../adr/0003-agentic-delivery-system.md).

## Goal

Wire the 26 agents into the pipeline the owner asked for: `/feature` → `/build` → `/qa` → `/pr-review`, plus `/bugfix`, `/bug`, `/retro`, `/tidy` and `/worktrees`. Then explain the system to judges without overstating it.

## What the AI did

- **One controller session ran superpowers `subagent-driven-development`.** Each of W4-1..W4-4 had its own git worktree. A sonnet `implementer` built each ticket test-first. Then a task reviewer checked it against the ticket brief:
  - sonnet for W4-1 and W4-4
  - opus for W4-2 and W4-3, weighted towards security, because `pr-review` feeds the merge-gate token and `bugfix` feeds a shell
- **Each fix round got a scoped re-review before merge.** Merges were `git rebase main` then `git merge --ff-only`, with `pnpm verify` after each (Plan 1c's bootstrap rule: no push before W5-1).
- **What landed:**
  - W4-1: `feature-analyze`, and `/feature` rewired to it. 1 fix round.
  - W4-2: `pr-review` with the G8 status and the end-of-plan dual review. 1 fix round.
  - W4-3: `bugfix`, `/bugfix` and `/bug`. 2 fix rounds, plus a one-line widening into `gate-checker.md`.
  - W4-4: `retro`, `/retro`, `/tidy` and `/worktrees`. 1 fix round, under a 2-round cap because it was first in the cut order.
- **The session hit its limit mid-wave and stopped at a safe point.** It wrote a ledger handoff first. Two dispatched reviews and one implementer report hadn't been read yet. The resumed session collected them before acting on anything.
- **W4-5 (this entry) wrote `docs/ai-system.md`, ADR 0003, this journal and the `docs/status.md` handoff.** Every count in them came from `ls` and the agents' frontmatter, not from the brief. Checking the docs against the code turned up claims that needed correcting (see below). An opus accuracy review then found further slips in the docs themselves, fixed in a review-fix commit.

## The two earlier catches this wave builds on

- **W2-2: the pipeline silently overrode an approved plan** ([journal 001](001-agentic-system-dry-run.md); ledger `docs/agent-runs/2026-10-26-dry-run-plan-4a-task-2.md`).
  - What happened: the first live `/build` ran on Plan 4a Task 2, whose acceptance test requires `maskPan('ABC')` to throw `RangeError`. The implementer built it that way. `consistency-reviewer` then flagged the throw as drift from an unrelated golden example, and two `finding-verifier` calls confirmed the finding (0.95 and 0.82 confidence). The reviewer and verifier prompts carried only a task title and the diff, never the plan text.
  - Result: a fix pass changed `maskPan` to return `null` and rewrote the plan's own acceptance test to match.
  - Caught before merge: the owner was asked, the throw was restored, and the plan text was added to the task-level reviewer and verifier prompts (`ae9c8fc`). The same gap in `qa` was closed later (`3485e8c`).
- **W3-4: a remote-code-execution path in `pr-reviewer`** ([journal 002](002-wave-3-agents-and-rce-catch.md); ledger `docs/agent-runs/2026-10-27-plan-1c-wave-3.md`).
  - What happened: a dedicated security-reviewer (opus) pass reproduced a working exploit. A crafted PR filename could break out of `pr-reviewer.md`'s worked-example `node -e` script, and a fixed heredoc delimiter could be terminated early by untrusted text.
  - Why it mattered: this agent holds the token that posts the G8 verdict, so a malicious PR could have approved itself.
  - Round 2 fixed it. Untrusted values now reach the script only through `process.env`, and the delimiter is a per-run random token with a collision check. All 3 original exploit strings plus 9 more hostile strings were run against the old and new text: they fired against the old text and were inert against the new.
  - Round 3 fixed a separate HIGH: the script's fail-closed exit didn't stop the shell's review POST. It was verified with 8 negative cases and 1 positive control.

## Tests added

- `.claude/hooks` Vitest grew from 1118 tests at the end of Wave 3 to 1555, across 26 files.
- The new test files are:
  - `bugfix.test.mjs` (197 tests)
  - `pr-review.test.mjs` (116)
  - `feature-analyze.test.mjs` (41)
  - `retro.test.mjs` (39)
  - `lib/tidy.test.mjs` (9)
- The workflows are tested by running each script on a `vm`-based fake of the Workflow runtime. They are not tested on the live runtime.
- Engine: unchanged, 30 tests at 98.76% line coverage. No Maestro or Playwright changes.

## Review findings & fixes

Every ticket needed at least one fix round. The serious findings share one shape: **a gate that fails open when an agent's answer is missing or untrustworthy.** The independent task reviews found them, and some (the null-verifier approve path and the `retro` rename bypass) were reproduced with a probe or a scratch repo, not just read.

- **A null verifier could approve a PR (W4-2, Important).** `pr-review` passed a missing `finding-verifier` verdict to the shared policy. The policy refutes non-security `high` findings when the verifier is unsure. So a crashed verifier could turn a real `high` correctness finding into `approve`, a `success` status, and an auto-merge.
  - Fix: in `pr-review`, a missing verdict keeps a blocking finding confirmed, and it is counted as `unverified`.
- **The verifier could overrule a reviewer's FAIL (W4-2, Important).** In end-of-plan mode, `passed` was computed after verification. So a low-confidence or null verifier could turn an opus reviewer's `high` finding into a pass.
  - Fix: any critical or high finding from a reviewer means "not passed", and the verifier can only annotate it.
- **Analyst-controlled `fixFiles` could bypass the regression-test lock (W4-3, Important).** `bug-analyst` names the files the fix may touch. If that list contained the pinned regression test, or later a test-runner config, the implementer could weaken or exclude the test that proves the bug.
  - Fix: a protected-path list and a `regression-test-modified` check.
  - Still open: the Maestro config is not on that list (ruling W4-3f).
- **`verified` rested on an agent's word (W4-3, Important).** The close-time "verified" came from `bug-reporter` saying so.
  - Fix: it now also needs a gate-proven, freshly committed evidence file under `docs/test-reports/bugs/<N>/`.
  - The wording says plainly that the gate does not re-run the test.
- **A `git mv` hid a deletion from the drift guard (W4-3, round 2).** Without `--no-renames`, a move into the evidence folder showed only the destination path.
  - Fix: `gate-checker.md`'s two `git diff --name-only` calls now use `--no-renames`. This also hardens `feature-build`'s drift guard, which had the same root cause.
- **The `retro` diff-scope check could be bypassed (W4-4, Important).** The validator checked only `---`/`+++` lines. A `rename from/to` section passed it, and `git apply` then renamed `settings.json`. The reviewer reproduced this in a scratch repo.
  - Fix: any rename, copy, mode, new, deleted or binary section is rejected.
- **Smaller fixes:**
  - `/worktrees` printed "Predicted conflicts: none" when it had skipped the predictions.
  - A test pinned the current empty ledgers and would have broken the moment the planned follow-up landed.
  - `feature-analyze` reported "no criteria" as an agent failure. It now returns `empty`.
- Deferred minors are listed by ticket in the run ledger, not here.

## Where AI was wrong / where I overrode it

- **The Wave 4 implementer agents wrote most of the fail-open paths above, and each ticket's own tests passed before review.** The `--no-renames` gap is the exception: it was older, since `feature-build`'s drift guard had the same root cause. Most of these paths treat a missing or untrusted answer as harmless. The independent reviewers found them by asking "what if this agent returns nothing, or lies?"
- **The controller's own handoff had gaps.** At the session stop, one implementer report had never been read and two reviews had no recorded result. The ledger says so plainly, and the next session collected them before merging anything.
- **Five corrections came out of checking the docs against the code (W4-5):**
  - The live-runtime limit needed a finer statement. An earlier version of `feature-build` and `qa` ran live in the W2-2 dry run. Five later commits changed those workflows or their gate, and every one of them is unit-tested only: `6316f15`, `ae9c8fc`, `3485e8c`, `d37f0a8` and `fd7f0a6`. No live re-run was performed. The four Wave 4 workflows have only ever run on the fake runtime.
  - The W4-2 fix made a missing verdict fail closed only inside `pr-review`. `feature-build` and `qa` still drop a non-security `high` finding when the verifier crashes. This is recorded as open, not fixed here (outside this ticket's files).
  - `build-error-resolver` is described as the retry fixer, but no workflow dispatches it.
  - The Wave 3 ledger says "14 new agent files" where there were 12 (the agent count went from 14 to 26).
  - My own first draft of `docs/ai-system.md` said a failed reviewer is "never silently dropped". `feature-build` does drop a failed task-level reviewer, only logging it. I corrected this in `22790de` and recorded it as open.
- **Who decided what:**
  - **The owner decided:**
    - in the spec (§13): the merge model (agent-reviewed, gate-enforced), security as a first-class gate, and maximum reuse of ECC
    - in the W2-2 dry run: keep the plan's `maskPan` throw, defer the `qa` plan-text gap, and accept unit-harness validation instead of a live re-run
    - on 24 Oct: fix the `qa.proposals` fencing gap (`20ab88f`)
    - on 26 Oct: proceed with Wave 3 rather than pivot to product work
    - Wave 5's push, Sonar, branch protection and board are owner actions.
  - **The controller session (Claude) decided** every "Ruling W4-…" in the ledger. Each has a stated cost if wrong. Examples: keep only blocking findings verified in `pr-review` (W4-2e), accept the `--close` design (W4-3b), and leave `/retro` with no data until `journal-writer` emits an `## Agent stats` table (W4-4a).
  - The Wave 4 ledger records no question put to the owner during the wave.

## What I learned

- **Every gate needs a test for the "agent returned nothing" case.** It is the most common way these gates failed open. A shared policy can't decide it alone: whether "unsure" and "absent" mean the same thing depends on the gate.
- **Give security-sensitive orchestration an opus review that is weighted towards security.** By the ledger's count, the opus reviews raised 2 Important findings on W4-2 and 7 on W4-3, plus 1 more in W4-3's re-review. The sonnet reviews raised 1 on W4-1 and 3 on W4-4.
- **Docs for judges should be written from `ls` and the code, and then reviewed for accuracy.** Each pass here found a statement that needed narrowing, my own drafts included.

## Time spent

Wave 4 ran on 27 Oct 2026 across two controller sessions (the first stopped at its session limit). No per-ticket wall-clock was recorded, and `stats.tokens` is not implemented.
