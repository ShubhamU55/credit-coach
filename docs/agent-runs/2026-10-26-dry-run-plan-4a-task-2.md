---
purpose: Plan 1c Task W2-2 -- dry run of the feature-build/qa Workflow pipeline (built in W2-1) on a real task, with injected faults
run: 2026-10-25..26, controller session credit-coach, worktree ../cc-plan4a-t2, branch feat/plan4a-t2-formatters
---

# W2-2 dry run: Plan 4a Task 2, `/build --dry-run drift,tests`

This is the first real exercise of the `/build` command W2-1 spent 5 fix rounds building. Task 2
(Plan 4a: pure formatter functions in `packages/engine`) was chosen as a small, self-contained,
low-risk task specifically so a dry run's findings would be about the pipeline, not about a
complex product feature.

## Command run

```
Workflow({ name: 'feature-build', args: {
  planPath: 'docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md',
  specPaths: ['docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md'],
  tasks: [<Task 2, parsed via plan-tasks.mjs>],
  dryRun: { faults: ['drift', 'tests'] },
}})
```

Run from a session whose cwd was pinned to the worktree via `EnterWorktree` (a prior attempt from
a subagent correctly refused to run this from the main checkout's cwd, since the agents' `git`
calls would have landed on `main` instead of the worktree -- flagged and escalated rather than
guessed at).

37 agents, 1,459,335 tokens, 426 tool calls, ~60.7M ms of wall-clock Workflow-tool duration (most
of that is 3 stalls on one `edge-case-hunter` call -- 3798s, 22434s, 29823s before it finally
completed -- an infra/network issue, not a design bug; noted, not investigated further).

## Part 1: the fault-injection mechanics worked exactly as designed

| Attempt | Result      | Reason                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------- |
| 1       | `ok: false` | `drift: packages/engine/src/utilization.ts` (an injected out-of-scope commit) |
| 2       | `ok: false` | `tests-failed: exit 1`, `verify-failed: exit 1` (an injected failing test)    |
| 3       | `ok: true`  | clean implementation, `RESET TO` correctly discarded both injected commits    |

Final state confirms both injected faults left no trace: `git diff main -- packages/engine/src/utilization.ts`
is empty, and `rg -n "dry-run" packages/engine` finds nothing. This is the part of W2-1's design
the dry run set out to prove, and it held up on a real task, not just in `feature-build.test.mjs`'s
mocks.

## Part 2: what the dry run actually found -- a real, serious pipeline defect

The attempt loop succeeded, but the subsequent task-level review + QA phase did something it
shouldn't have, and nothing in the pipeline caught it before it reached a mergeable commit.

### The maskPan incident

Plan 4a Task 2's own acceptance tests are explicit: `maskPan('ABC')` throws `RangeError`. The
implementer built this correctly. Then:

1. `consistency-reviewer` flagged the throw as drift from an unrelated golden example
   (`utilization.ts`, which returns `null` for invalid input) and `docs/standards.md`'s general
   "engine functions never throw for an expected domain outcome" rule.
2. Two `finding-verifier` calls confirmed this finding (0.95 and 0.82 confidence) without ever
   checking the plan's own text -- `reviewerPrompt`/`verifierPrompt` only ever carried a task
   title and the diff, never the plan's literal task text, so neither agent had any way to know
   the throw was the plan's own explicit requirement, not undocumented drift.
3. A fix pass then changed `maskPan` to return `null` **and silently rewrote the plan's own
   acceptance test** (`format.test.ts`) from `expect(() => maskPan('ABC')).toThrow(RangeError)` to
   `expect(maskPan('ABC')).toBeNull()`.

This is exactly the failure mode CLAUDE.md's non-negotiables exist to prevent (if the approved
spec and the code disagree, raise the conflict, never silently pick one) -- except here the
pipeline itself did the silent picking, on an approved plan, with zero owner visibility. One other
`finding-verifier` call, on a _different_ finding (the `1999.6 -> ₹2,000` rounding behavior),
proactively checked the plan file on its own initiative and correctly refuted a false positive by
citing it -- proving the capability exists in the agents, just not structurally guaranteed. The one
time it mattered, it didn't happen.

### Three more things found while verifying the above

- **The QA-confirmed-findings fix pass (commit `0b1c6b8`) shipped untested behavior changes.**
  `formatINR`, `formatPercent`, `formatScoreRange` and `parseIsoDate` all gained new `RangeError`
  validation paths (legitimate fixes for real bugs -- see ECH-1/ECH-2 below), but the fix pass's
  own gate ran `TEST: none` / `EXPECT: none`, so none of the new branches had any test coverage.
  Engine line coverage dropped from 100% to 93.82% as a direct result -- still above the >=90%
  engine gate, so `pnpm verify` passed while the new behavior was completely unverified.
- **A security-flagged test removal was too blunt.** The harness itself raised a "Security Test
  Removal" warning for commit `0f34ae9`. One `it()` block held 4 Unicode-look-alike assertions for
  `maskPan` (fullwidth Latin, Devanagari digits, zero-width space, non-breaking space); only the
  4th (NBSP) was a genuine false positive (`String.prototype.trim()` legitimately strips U+00A0,
  so that input reduces to a real valid PAN -- correctly refuted by `finding-verifier`). Removing
  "the test" deleted the whole `it()`, taking the 3 genuinely-valid assertions down with it, so
  `maskPan` was left with **zero** Unicode-look-alike coverage.
- **A tester-accounting bug.** `functional-tester` was correctly skipped (no acceptance criteria
  exist yet -- `requirements-analyst` isn't built until Wave 3). But the skip was folded into the
  same `results` array `collectFindings` scans for failures, so a deliberate, correct skip showed
  up as `failedTesters: ["functional-tester"]` and inflated `counts.testers` to 3 when only 2
  testers (`edge-case-hunter`, `security-reviewer`) actually ran. This directly contradicts a
  W1-to-W2-1 carry-forward that explicitly required this to read as not-applicable, never a block.

## QA phase findings (the legitimate ones)

6 confirmed, 2 refuted, across edge-case-hunter and security-reviewer (functional-tester correctly
not dispatched, no acceptance criteria given):

| ID              | Severity | Finding                                                                                                               | Disposition                                                                                                                                                                            |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECH-1           | medium   | `formatINR` renders garbage for `NaN`/`Infinity`/beyond-safe-integer input                                            | Fixed (kept, now tested)                                                                                                                                                               |
| ECH-2           | medium   | `parseIsoDate` silently rolls over impossible calendar dates (`2026-02-29`, `2026-04-31`)                             | Fixed (kept, now tested)                                                                                                                                                               |
| ECH-4           | low      | `formatPercent` used an ASCII hyphen where `formatINR` uses the typographic minus (U+2212)                            | Fixed as part of the same pass                                                                                                                                                         |
| ECH-5           | low      | `maskPan` accepted a non-ASCII letter that `toUpperCase()` case-folds into two ASCII letters (e.g. `ß` -> `SS`)       | Fixed (ASCII-shape pre-check, kept in the reverted throw-based `maskPan`)                                                                                                              |
| sec-2           | low      | The task prompt's rendered DIFF text for `formatINR` was missing `Math.round(...)` that the actual committed file has | Harness-text observation only, no code fix needed -- flagged for whoever maintains the diff-rendering step                                                                             |
| sec-3           | low      | Several formatters produced garbage (`NaN%`, `undefined, NaN undefined`) instead of failing fast on malformed input   | Fixed via ECH-1/ECH-2's same validation pass                                                                                                                                           |
| F2 (task-level) | —        | A reviewer flagged `formatINR`'s rounding as drift from the diff text shown (not from the real committed code)        | Correctly refuted -- `finding-verifier` proactively checked the plan's own acceptance test (`1999.6 -> ₹2,000`) and the real committed file via `git show`, not just the rendered diff |

## Fixes applied this session (all on `feat/plan4a-t2-formatters`, test-first, each independently verified non-vacuous against the pre-fix code)

1. **`33db799`** -- Reverted `maskPan` to the plan-mandated throw, restored the plan's own
   acceptance test, kept the ECH-5 ASCII-shape pre-check (reapplied in throw form). Added real edge
   tests for the 4 new throwing behaviors (`formatINR`/`formatPercent`/`formatScoreRange`
   non-finite input, `parseIsoDate` malformed/impossible dates) -- each confirmed to fail against
   the pre-fix code (`bd3f593`) and pass against the fixed code, so they're proven non-vacuous, not
   just retroactively added. Restored the 3 valid Unicode-look-alike assertions the over-broad test
   removal deleted, keeping the NBSP case correctly excluded (it was a genuine false positive).
   Engine coverage restored to 98.76% lines (30/30 tests).
2. **`6316f15`** -- `summarizeQa` now takes a `notApplicable` list separately from `results`, so a
   deliberately-skipped tester no longer lands in `failedTesters` or inflates `counts.testers`.
   Two new tests (a `summarizeQa` unit test, a full runtime test reproducing the no-criteria skip
   path) confirmed RED against the pre-fix code, GREEN after.
3. **`ae9c8fc`** -- `reviewerPrompt` (code-reviewer/consistency-reviewer) and `verifierPrompt`
   (finding-verifier) for task-level findings now carry the plan's own task text, trusted and
   unfenced (the same status `implementerBrief` already gives it), with an explicit instruction:
   do not confirm a finding whose fix would change behavior the plan text explicitly requires;
   refute it and say so in the reasoning instead, since changing an approved spec is a decision for
   a human. Two runtime tests use the real Plan 4a Task 2 fixture (`TASK_2`, parsed from the actual
   plan file) to confirm the literal `` `'ABC'` throws `RangeError` `` text now reaches both the
   reviewer and verifier prompts, unfenced, ahead of the DIFF/FINDING fences.

Full suite after all 3 fixes: engine 30/30 (98.76% lines), hooks 970/970, `pnpm verify` green
across every workspace.

## Explicitly deferred, not fixed this session (owner decision)

- **The identical plan-text gap in `qa.workflow.js`'s `testerPrompt`/`verifierPrompt`, and in
  `feature-build.workflow.js`'s QA-confirmed-findings fix pass.** No QA-phase finding in this run
  actually contradicted the plan (ECH-1 through ECH-5 were all genuine gaps the plan never
  addressed, not plan conflicts) -- this is a latent structural risk of the same shape as the
  maskPan incident, not a proven second incident. Owner decision: defer to Wave 3 rather than widen
  this session's scope further. **Flag for whoever picks up Wave 3: any QA-phase tester
  (edge-case-hunter, security-reviewer, and eventually functional-tester/api-tester/ui-tester) can
  reproduce the exact same silent-override failure mode against a plan's explicit requirement,
  since none of them see task/plan text either.**
- **A live, fault-free re-run of `/build` to confirm the 3 loop fixes end-to-end.** The original
  dry run took ~17 hours of wall-clock Workflow-tool time (mostly 3 stalls on one agent call, an
  infra issue). Owner decision: the unit-test-harness validation (RED/GREEN plus non-vacuous
  regression checks against pre-fix code, the same discipline W2-1's 5 fix rounds used throughout)
  is sufficient given the fixes are small, additive and well-isolated (new prompt content, a
  renamed result field) rather than the structural rewrites W2-1 dealt with. No live re-run was
  performed.
- **`stats.agents` undercounts** (reported 13 of the 37 agents that actually ran -- it never counts
  `gate-checker`/`fault-injector` calls) and **`stats.tokens` is always `null`** (hardcoded). Minor,
  cosmetic, not fixed -- noted for whoever next touches `feature-build.workflow.js`'s stats
  accumulator.
- **An unreachable branch in `maskPan`** (line 164's `PAN_PATTERN` mismatch throw): given
  `ASCII_PAN_SHAPE` and `PAN_PATTERN` only differ in letter case, and `toUpperCase()` runs before
  the `PAN_PATTERN` check, every string that passes `ASCII_PAN_SHAPE` already satisfies
  `PAN_PATTERN` after uppercasing -- this was already true in the original implementation (95.83%
  branch coverage was reported even before any of this session's changes), not a regression
  introduced here. Noted, not fixed (dead defensive code, not a correctness bug).

## Out-of-scope findings (bug-reporter not built yet -- §build-skill step 4, listed here instead)

- **F1** (low, consistency): the implementer's commit subject deviated from the plan's exact
  wording (`feat: Formatters in the engine (pure, shared with admin)` vs. the plan's specified
  `feat(engine): add INR, percent, date, score-range and PAN formatters`). No functional impact;
  worth a future carry-forward that `implementerBrief` should pin the exact plan-specified commit
  subject when one is given, same as the commit-message pre-check carried forward from Wave 1.

## Merge

Rebased onto current `main`, `pnpm verify` green post-rebase, merged `--ff-only`. See `docs/status.md`
for the final state and what Wave 3 should pick up.
