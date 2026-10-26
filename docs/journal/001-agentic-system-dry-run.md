# 001: Agentic system dry run caught the pipeline overriding an approved spec

- **Date:** 2026-10-26
- **PRD refs:** n/a (this is infrastructure for building the product, not the product -- Plan 1c)
- **Plan:** docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md (Task W2-2)
- **Commits:** `33db799`..`ae9c8fc` on `feat/plan4a-t2-formatters` (branched from `main` at `3fbae0b`)

## Goal

W2-1 spent 5 independently-reviewed fix rounds building the `feature-build`/`qa` Workflow-tool
pipeline behind `/build` and `/qa` -- but every one of those rounds was validated against the
pipeline's own unit-test mocks, never a real task. W2-2's job was to run it for real, on a small,
low-risk task (Plan 4a Task 2: pure formatter functions), with two deliberately injected faults
(a drift commit, a failing test) to prove the attempt-retry loop actually catches real problems,
not just the ones its own tests describe.

## What the AI did

- Dispatched a fresh subagent with no memory of W2-1's design decisions to run the dry run
  impartially. It correctly refused to proceed: it had no `Workflow` tool as a subagent, and even
  if it had, its cwd was the main checkout, not the worktree -- running the loop there would have
  let the agents' `git` calls commit the injected drift fault straight onto `main`. It escalated
  this instead of working around it.
- Used `EnterWorktree` to pin the controller session's own cwd to the worktree, then ran the
  Workflow directly: `Workflow({ name: 'feature-build', args: {...} })`.
- The 3-attempt fault-recovery loop worked exactly as designed (drift caught -> test failure
  caught -> clean pass), proving that part of W2-1's design for real.
- The task-level review and QA phase then surfaced a real defect in the _pipeline itself_, not
  just in the formatter code: `consistency-reviewer` flagged `maskPan`'s plan-mandated
  `RangeError` throw as "drift" from an unrelated golden example, two `finding-verifier` calls
  confirmed it without ever seeing the plan's own text, and a fix pass silently changed the
  behavior **and rewrote the plan's own acceptance test** to match. Verified by reading the plan
  text, the generated prompts (`reviewerPrompt`/`verifierPrompt` only ever carried a diff and a
  task title), and the actual committed diffs at each commit.
- Used `advisor` before deciding how to respond -- it caught 2 more real issues I'd have missed
  (an untested QA-driven behavior change that dropped engine coverage from 100% to 93.8%; a
  "Security Test Removal" warning where fixing one wrong assertion deleted 3 correct ones sharing
  its `it()` block) and correctly identified a confound I'd introduced myself (stripping `task.text`
  when hand-building the Workflow args for a different diagnostic check).
- Used `AskUserQuestion` twice rather than deciding unilaterally: once for the 3 substantive
  product/process decisions (keep the plan's `maskPan` throw vs. amend the plan; keep the new
  validation throws vs. revert them; fix the pipeline gap now vs. defer), once for 2 scope
  questions after the fixes landed (whether to also close the identical gap in `qa.workflow.js`'s
  tester path; whether a costly live re-run was warranted before merging).
- Fixed all 3 agreed items test-first, each verified non-vacuous by running the new/changed tests
  against the pre-fix code and confirming they failed for the right reason, then passed after.

## Tests added

- **Vitest (engine):** `format.edge.test.ts` grew from 3 `describe` blocks to 8 -- restored the
  3 valid Unicode-look-alike `maskPan` assertions an over-broad test removal had deleted, added
  new edge tests for `formatINR`/`formatPercent`/`formatScoreRange` non-finite input and
  `parseIsoDate` malformed/impossible dates (4 new `describe` blocks, 7 new assertions total).
  Engine: 20 -> 30 tests, coverage 93.82% -> 98.76% lines.
- **Vitest (hooks):** `qa.test.mjs` +2 tests (a `summarizeQa` unit test, a runtime test) for the
  not-applicable-vs-failed tester distinction. `feature-build.test.mjs` +5 tests (2 `verifierPrompt`
  unit tests, 1 existing test's assertion updated, 2 new runtime tests using the real Plan 4a
  Task 2 plan fixture) confirming the plan text now reaches both reviewer and verifier prompts.
  Hooks: 964 -> 970 tests.

## Review findings & fixes

- **The maskPan incident** (see Where AI was wrong, below) -- fixed by reverting `maskPan` to the
  plan's throw-based contract and, separately, giving `reviewerPrompt`/`verifierPrompt` the plan's
  own task text with an explicit instruction not to confirm a finding that would override it.
- **ECH-1/ECH-2** (`formatINR`/`formatPercent`/`formatScoreRange` render garbage for non-finite
  input; `parseIsoDate` silently rolls over impossible dates) -- legitimate findings, kept, now
  properly tested (they'd shipped with zero coverage from the QA fix pass that found them).
- **A tester-accounting bug** -- a correctly-skipped `functional-tester` (no acceptance criteria
  exist yet) was counted as a _failed_ tester, contradicting an explicit W1-to-W2-1 carry-forward.
  Fixed by separating `notApplicable` from `failedTesters` in `qa.workflow.js`.

## Where AI was wrong / where I overrode it

- **The pipeline (not me) got this one wrong, and it's the most important finding of this run:**
  W2-1's own review/fix-pass loop silently overrode an approved plan's explicit requirement with
  no human visibility, because the reviewer and verifier agents it dispatches were never given the
  plan's own text -- only a diff and a title. This is exactly the "if code and the spec disagree,
  raise the conflict, don't silently pick one" rule CLAUDE.md states as a non-negotiable, violated
  by the infrastructure meant to enforce quality, not by a careless agent. It reached a real,
  committed, test-rewritten state before anyone looked. Caught only because this dry run's whole
  purpose was to look closely at a small, low-risk task.
- **I made a diagnostic mistake earlier in this run** (not part of the fixes above): when I
  hand-built the Workflow's `args` to run the dry run directly, I dropped the `text` field from
  the parsed task object, which likely explains a separate minor finding (the implementer missing
  the plan's exact specified commit message). Noted in the run ledger so a future `/build` caller
  passes the full `plan-tasks.mjs` output, not a hand-trimmed copy.
- **One `finding-verifier` call did the right thing on its own initiative** -- for a different
  finding (a reviewer misreading rendered diff text), it proactively checked the plan file and the
  real committed code via `git show`, rather than trusting the prompt's own diff text, and
  correctly refuted a false positive. This proves the capability already exists in the agents; the
  fix makes it structurally guaranteed instead of incidental.

## What I learned

- A fully green `/build` run (`status: done`, all gates passing) is not the same as a _correct_
  run -- the attempt-retry mechanics can work perfectly while the review layer makes a decision
  that quietly contradicts the approved plan, and nothing in the existing schema or gate checks
  would have caught it. "It passed" needs its own skepticism, the same as any other agent claim.
- Giving a reviewer/verifier the diff without the spec it's being measured against is an
  invitation to confirm "drift" that's actually compliance. Any review step built on a diff alone,
  without the thing the diff is supposed to satisfy, has this exact failure mode available to it --
  worth checking for in `qa.workflow.js`'s tester path too (deferred to Wave 3, not proven to have
  happened there yet, but structurally identical).
- "Remove the test" is a blunt instruction when a tester groups multiple assertions into one
  `it()` block -- a partially-wrong test case needs a partial fix, not a deletion, or correct
  coverage gets thrown out along with the wrong assertion.

## Time spent

About 1 session's worth of wall-clock controller time, plus one ~17-hour background Workflow run
(dominated by 3 stalls on a single `edge-case-hunter` call, not useful work) that happened across
a session-limit pause and resume.
