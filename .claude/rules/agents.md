<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Agent Orchestration

All agents live in `.claude/agents/` and are invoked through the Agent tool with `subagent_type: "<name>"`. The agent-lint check keeps every file registered and its sections in order. Each agent's own file is the contract; this table is the index.

## Reviewers

| Agent                     | Purpose                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **planner**               | Second opinion on a plan written with superpowers `writing-plans`                                                                                        |
| **code-reviewer**         | General code quality, patterns, best practices                                                                                                           |
| **typescript-reviewer**   | TypeScript/JavaScript specific issues                                                                                                                    |
| **react-reviewer**        | React/JSX issues (`.tsx`)                                                                                                                                |
| **security-reviewer**     | Security vulnerabilities, OWASP Top 10                                                                                                                   |
| **silent-failure-hunter** | Swallowed errors, bad fallbacks, missing error propagation                                                                                               |
| consistency-reviewer      | Compares the diff to `docs/standards.md` **and** to the golden example of the same kind; flags pattern drift                                            |
| finding-verifier          | Adversarial: tries to **refute** one finding with evidence, defaulting to refuted when unsure; only confirmed findings are fixed                         |
| pr-reviewer               | Posts the merge-gate verdict (G8): one review with inline comments for confirmed findings, plus the `pr-review` commit status                            |
| pr-test-analyzer          | Powers the `pr-reviewer` **test-adequacy** lens: do the PR's tests cover the changed behavior                                                            |

## Analysis (before a plan or diff exists)

| Agent                | Purpose                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| requirements-analyst | PRD section → numbered acceptance criteria (given/when/then), open questions and an out-of-scope list                                    |
| domain-checker       | Checks criteria, plan or diff against `credit-domain` facts F1–F7, the planner order and the anti-goals                                  |
| design-checker       | UI work only: checks against `docs/design.md` tokens, components, copy and accessibility; names the kit components to use                |

## Build

| Agent                | Purpose                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| implementer          | Implements **one plan task** test-first (superpowers TDD), runs the task's tests and commits; writes only the task's `Files:` list                                                                                                                      |
| gate-checker         | Runs commands and reports facts only: `MODE: start` (head, dirtyFiles), `MODE: check` (full `GATE_FACTS`), `MODE: diff` (merge-base changed files + diff). **No opinions, no lint/Sonar summary**                                                       |
| build-error-resolver | Retry-pass fixer when `gate-checker` reports tsc or ESLint failures (no workflow dispatches it yet; retries go to `implementer`)                                                                                                                                                                                     |
| test-automator       | Owns the test automation infrastructure: turns criteria and tester proposals into durable tests in the right layer, wires them into `pnpm verify` and CI; quarantines a pre-identified flaky test from an explicit `flaky[]` input, never a silent skip |

`tdd-guide` is retired (superseded by `implementer` + superpowers `test-driven-development`).

## Testers (used by the `qa` workflow; they propose, `test-automator` lands)

| Agent              | Purpose                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| functional-tester  | Checks that every acceptance criterion has a test that would fail without the feature; proposes missing ones                                                                 |
| edge-case-hunter   | Boundaries only (zero, negative and huge amounts, empty lists, month-end and leap days, time zones, Unicode, 200% font, offline); proposes fast-check property tests         |
| api-tester         | Supabase: contract tests (response-shape checks) for tables, RPCs and Edge Functions; RLS isolation; error codes; LLM timeout fallback                                                           |
| ui-tester          | Maestro flows and screenshots vs `docs/design-mockups/v3`: touch targets ≥ 48, ranges never wrap, colour never the only signal, reduce-motion. Device-bound                  |
| integration-tester | Cross-component: app ↔ Supabase ↔ admin, and the demo path end to end (try sample → plan within 60 s). Device-bound, runs after `ui-tester`                                   |

## Bugs and records

| Agent          | Purpose                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bug-analyst    | Reproduces a bug, runs a root-cause analysis (superpowers `systematic-debugging`), writes the failing reproduction test as a proposal and fills the ticket's RCA. **Never fixes product code** |
| bug-reporter   | Turns each **confirmed** tester finding into an evidenced bug ticket from the bug template; deduplicates against open bugs                                                                  |
| pm-sync        | Creates and updates GitHub issues and Project items from workflow results                                                                                                                   |
| journal-writer | Writes the run ledger and the journal entry from the workflow result; as the janitor role it only **proposes** stale-file deletions                                                         |

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** A spawned task is not a completed task until its result is collected and returned.
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.
