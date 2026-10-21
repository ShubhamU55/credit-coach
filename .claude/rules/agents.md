<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Agent Orchestration

## Kept reviewers (already in `.claude/agents/`)

Invoked through the Agent tool with `subagent_type: "<name>"`.

| Agent                     | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| **planner**               | Implementation planning; complex features, refactors       |
| **code-reviewer**         | General code quality, patterns, best practices             |
| **typescript-reviewer**   | TypeScript/JavaScript specific issues                      |
| **react-reviewer**        | React/JSX issues (`.tsx`)                                  |
| **security-reviewer**     | Security vulnerabilities, OWASP Top 10                     |
| **silent-failure-hunter** | Swallowed errors, bad fallbacks, missing error propagation |

## Planned roster (Plan 1c)

The rest of this roster is planned, not yet built. Until an agent exists, use the closest kept reviewer above or do the step inline; don't claim one of these runs today.

| Agent                | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| implementer          | Writes the code for a ticket                              |
| gate-checker         | Runs the quality gates before handoff                     |
| build-error-resolver | Fixes build/typecheck failures                            |
| test-automator       | Writes/updates automated tests                            |
| finding-verifier     | Confirms a reported finding is real before it blocks      |
| consistency-reviewer | Checks a change against PRD/design/domain facts           |
| requirements-analyst | Clarifies PRD/ticket scope before build                   |
| domain-checker       | Checks credit-domain facts (F1-F7) are respected          |
| design-checker       | Checks a screen against `docs/design.md`                  |
| functional-tester    | Exercises the happy path                                  |
| edge-case-hunter     | Looks for boundary and failure cases                      |
| api-tester           | Exercises admin/Edge Function endpoints                   |
| ui-tester            | Exercises mobile/admin UI flows                           |
| integration-tester   | Exercises cross-package flows                             |
| bug-analyst          | Root-causes a reported bug                                |
| bug-reporter         | Files a reproducible bug report                           |
| pr-reviewer          | Reviews a PR end to end                                   |
| pr-test-analyzer     | Checks PR test coverage                                   |
| pm-sync              | Keeps ticket/status docs in sync                          |
| journal-writer       | Writes the `docs/journal/` entry (the `/journal` command) |

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** A spawned task is not a completed task until its result is collected and returned.
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.
