# ADR 0003: Workflow scripts coordinate the agents, a pasted contracts block keeps them honest, and G8 is a commit status

- **Status:** Accepted. The decisions date from 21–27 Oct 2026; this record was written on 27 Oct 2026, after Plan 1c Wave 4 merged.
- **Related:** spec `docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md` (§4, §8, §8.9), plan `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`, [ADR 0002](0002-curated-ai-dev-setup.md), [`docs/ai-system.md`](../ai-system.md).

## Context

- ADR 0002 gave the repo a curated set of agents. Plan 1c turns them into a repeatable pipeline: `/feature` → `/build` → `/qa` → `/pr-review`, plus `/bugfix` and `/retro`.
- Hard constraints, verified on 21 Oct (spec §4):
  - a Claude Code subagent can't start subagents
  - Workflow scripts can't `import`, have no file-system or Node API, and can't read the clock or randomness
  - workflows nest only one level deep
- Agent output varies from run to run. Judges and the owner need gate decisions that can be reproduced and tested, not an agent's own "done".
- One GitHub account (`ShubhamU55`) both authors PRs and posts the agent review.

## Decision 1: a Workflow script is the coordinator, not an agent

**Options**

1. **A "feature agent" that dispatches the others.** Rejected: a subagent can't start subagents.
2. **The main session coordinates by hand from a checklist.** Rejected: it isn't repeatable or testable, and the main session's own judgement becomes the gate.
3. **A Workflow script per phase, started by a slash command.** Accepted.

**Decision**

- There are six workflows in `.claude/workflows/`: `feature-analyze`, `feature-build`, `qa`, `pr-review`, `bugfix` and `retro`. Each one starts only from an explicit command. The one exception is `qa`, which `feature-build` also calls inline after its last task; that is the only workflow-to-workflow call.
- The script decides what runs next.
- Agents return schema-validated envelopes, and `gate-checker` reports git and test facts.
- The script compares the facts itself: the drift guard, the retry cap of 2, then escalation.

## Decision 2: shared decision logic lives once in `contracts.mjs` and is pasted into each workflow

**Options**

1. **Each workflow writes its own schemas, verifier policy and drift guard.** Rejected: six copies would drift apart, with nothing to catch it.
2. **A build step that bundles a shared module into each workflow.** Rejected: it adds tooling and a generated-file step, and the source on disk would no longer be the code that runs.
3. **One tested source, `.claude/hooks/lib/contracts.mjs`, pasted byte for byte between `// <contracts>` markers.** Accepted.

**Decision**

- `contracts.mjs` holds the shared logic: severities, schemas, dedupe, `applyVerifierPolicy`, `checkDrift`, `nextStep` and `wrapUntrusted`. `contracts.test.mjs` unit-tests it.
- `workflows-sync.test.mjs` fails `pnpm verify` if any workflow's block differs, or if a workflow reads the clock or randomness.
- Logic that only one workflow needs stays in that workflow's body. `pr-review`'s null-verdict rule (see the deviations below) is one example.

## Decision 3: the G8 merge gate is a commit status, not an approving review

**Options**

1. **`pr-reviewer` posts an `APPROVE` or `REQUEST_CHANGES` review, and branch protection requires an approval.** Rejected: GitHub won't let the PR author's own token approve or request changes, and here author and reviewer share one token.
2. **A second GitHub account or app for the reviewer.** Rejected: more secrets and setup for a solo, nine-day build.
3. **A `COMMENT` review carries the findings, and a `pr-review` commit status carries the verdict.** Accepted.

**Decision**

- The `pr-review` workflow computes the verdict. `pr-reviewer` only posts it: one `COMMENT` review with inline comments, then the `pr-review` status (`success` for approve, `failure` for request-changes). It never recomputes the verdict.
- W5-1 (planned, owner-gated) makes `pr-review` a required status check, with `required_pull_request_reviews=null`.
- Two request-changes rounds on one PR escalate to the owner.

## Known deviations from the spec and plan

These are recorded so that nobody mistakes them for the spec's behaviour.

- **Only blocking findings are verified in `pr-review`.**
  - Spec §8.9 says every finding goes through `finding-verifier`.
  - The W4-2 brief narrowed this to `critical`/`high`. Medium and low findings come back unverified as `advisory` and are not posted.
  - The gate verdict is the same either way (ruling W4-2e).
- **A missing verdict fails closed only in `pr-review`.**
  - In `pr-review`, a null or crashed verifier keeps a blocking finding confirmed (ruling W4-2b). In `end-of-plan` mode the verifier can't overrule a reviewer's critical or high finding (W4-2c).
  - `feature-build` and `qa` still pass a null verdict to the shared policy, which refutes a non-security `high` finding. This is open.
- **`feature-analyze` returns more than the plan's Returns line.** It adds a `status` of `failed`, `degraded`, `empty` or `done`, plus an `analystSummary`. An analyst that finds nothing to specify returns `empty`, not a failure.
- **`bugfix --close` is run by the command, not by `pm-sync`.**
  - `pm-sync` has no close verb. The `/bugfix <issue#> --close` command runs `gh issue close` itself, and only when the workflow returns `verified` (ruling W4-3b).
  - The PR's `Fixes #N` line already closes the issue at merge. The command reopens it if close-time verification fails.
  - `verified` rests on `bug-reporter` returning `done`, plus a gate proof that fresh evidence was committed. The gate does not re-run the test itself (W4-3e).
- **The Wave 4 workflows have run only on a fake runtime.**
  - `feature-analyze`, `pr-review`, `bugfix` and `retro` were tested on a `vm`-based fake of the Workflow runtime. Only `pr-review` has since run live, once, on a one-file scratch PR (2026-10-27, PR #3, closed unmerged): all six lenses ran clean and `pr-reviewer` posted its review and status. That proves the plumbing, not review quality on a real change. The other three have never run live.
  - An earlier version of `feature-build` and `qa` ran live once, in the W2-2 dry run. Every later change is unit-tested only: `6316f15`, `ae9c8fc`, `3485e8c`, `d37f0a8` and `fd7f0a6` (no live re-run was performed).
  - Whether the live runtime enforces `schema` the same way is still unproven.
- **G8 is self-attested.** `pr-review` is now a required check (30 Oct 2026), but it still only proves the review ran.
  - `pr-reviewer` posts its COMMENT review and the `pr-review` status with the same `ShubhamU55` token that opens the PRs. The first live run (PR #3) did exactly that, and the harness flagged it as self-approval.
  - The gate records a review; it does not prove an independent one, because the same token could post any status. Branch protection requires the CI gates (G1, G2, G4 to G7, G9) plus `changes` and `hold-check`, and does not require `pr-review`.
  - Making G8 independent needs a separate identity for `pr-reviewer` (a second account or a GitHub App). That is not done.

## Consequences

- **Gate decisions are deterministic and unit-tested.**
  - An agent saying "done" never passes a gate on its own. (The `--close` deviation above rests partly on `bug-reporter`'s `done`, alongside a gate proof.)
  - The fail-open bugs found in Wave 4 (see [journal 003](../journal/003-agentic-system.md)) were found and fixed as test cases.
- **Each workflow file is long.** It carries about 475 lines of pasted contracts, and five of the six exceed the 800-line soft ceiling. Sonar's duplication check excludes `.claude/workflows/**`.
- **Changing the contracts touches seven files:** `contracts.mjs` plus the six re-pasted blocks. The sync test makes a missed copy fail loudly.
- **G8 only binds once W5-1 lands.** Until then it is advisory. Plan 1c's own tickets merged fast-forward on local `main` under the bootstrap rule.
- **The verdict text is in the review body, not an approval.** GitHub's "approved" badge never appears.
