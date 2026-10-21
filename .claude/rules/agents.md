<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Agent Orchestration

## Kept reviewers (already in `.claude/agents/`)

Invoked through the Agent tool with `subagent_type: "<name>"`.

| Agent                     | Purpose                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| **planner**               | Second opinion on a plan written with superpowers `writing-plans` (§5) |
| **code-reviewer**         | General code quality, patterns, best practices                         |
| **typescript-reviewer**   | TypeScript/JavaScript specific issues                                  |
| **react-reviewer**        | React/JSX issues (`.tsx`)                                              |
| **security-reviewer**     | Security vulnerabilities, OWASP Top 10                                 |
| **silent-failure-hunter** | Swallowed errors, bad fallbacks, missing error propagation             |

## Planned roster (Plan 1c)

The rest of this roster is planned, not yet built. Until an agent exists, use the closest kept reviewer above or do the step inline; don't claim one of these runs today.

Purposes follow spec §5 (`docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md`); `build-error-resolver` and `pr-test-analyzer` come from the §14.1 ECC reuse map.

| Agent                | Purpose                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| implementer          | Implements **one plan task** test-first (superpowers TDD), runs the task's tests and commits; writes only the task's `Files:` list                                                             |
| gate-checker         | Runs commands and reports facts only (`git diff --name-only`, test output, `pnpm verify` exit code, lint and Sonar summary). **No opinions**                                                   |
| build-error-resolver | Retry-pass fixer when `gate-checker` reports tsc or ESLint failures (§14.1)                                                                                                                    |
| test-automator       | Owns the test automation infrastructure: turns criteria and tester proposals into durable tests in the right layer, wires them into `pnpm verify` and CI, triages flaky tests                  |
| finding-verifier     | Adversarial: tries to **refute** one finding with evidence, defaulting to refuted when unsure; only confirmed findings are fixed                                                               |
| consistency-reviewer | Compares the diff to `docs/standards.md` **and** to the golden example of the same kind (§7); flags pattern drift                                                                              |
| requirements-analyst | PRD section → numbered acceptance criteria (given/when/then), open questions and an out-of-scope list                                                                                          |
| domain-checker       | Checks the criteria and plan against `credit-domain` facts F1–F7, the planner order and the anti-goals                                                                                         |
| design-checker       | UI work only: checks against `docs/design.md` tokens, components, copy and accessibility; names the kit components to use                                                                      |
| functional-tester    | Checks that every acceptance criterion has a test that would fail without the feature; proposes missing ones                                                                                   |
| edge-case-hunter     | Boundaries only (zero, negative and huge amounts, empty lists, month-end and leap days, time zones, Unicode, 200% font, offline); proposes fast-check property tests for the engine            |
| api-tester           | Supabase: Zod contract tests for tables, RPCs and Edge Functions; RLS isolation; error codes; LLM timeout fallback (proposals)                                                                 |
| ui-tester            | Maestro flows and screenshots vs `docs/design-mockups/v3`: touch targets ≥ 48, ranges never wrap, colour never the only signal, reduce-motion                                                  |
| integration-tester   | Cross-component: app ↔ Supabase ↔ admin, and the demo path end to end (try sample → plan within 60 s) (proposals)                                                                              |
| bug-analyst          | Reproduces a bug, runs a root-cause analysis (superpowers `systematic-debugging`), writes the failing reproduction test as a proposal and fills the ticket's RCA. **Never fixes product code** |
| bug-reporter         | Turns each **confirmed** tester finding into an evidenced bug ticket from the bug template; deduplicates against open bugs                                                                     |
| pr-reviewer          | In-depth PR review and the merge-gate verdict (G8, §8.9): drives the `pr-review` fan-out, then posts the verified findings and the verdict to GitHub                                           |
| pr-test-analyzer     | Powers the `pr-reviewer` **test-adequacy** lens (§14.1)                                                                                                                                        |
| pm-sync              | Creates and updates GitHub issues and Project items from workflow results                                                                                                                      |
| journal-writer       | Writes the run ledger and the journal entry from the workflow result                                                                                                                           |

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** A spawned task is not a completed task until its result is collected and returned.
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.
