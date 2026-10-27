# Credit Coach: agent guide

**What we're building:** an Android app (plus a web admin control center) that tells people in India **what to pay, where, and when** each month to protect their CIBIL score. Solo hackathon build. Submission is due **30 Oct 2026 EOD**. Judges weigh _how AI was used to build it_ as much as the product.

## Start here

- **`docs/status.md`** is the session handoff log: current state, blockers, next step. Read it first, and update it at the end of every session.
- **Parallel-wave exception:** a session that the wave's hotspot table (Plan 1c) doesn't name as the `docs/status.md` owner writes its handoff in its run ledger (`docs/agent-runs/`) instead.

## Source of truth

- **`docs/PRD.md`** (frozen v1) holds the requirements. Read the relevant section before any feature work. If code and PRD disagree, the PRD wins. Raise the conflict; don't silently pick one.
- **PRD §4** lists the domain facts F1–F7. The **`credit-domain` skill** expands them. Never contradict them.
- **`docs/design.md`** (v3 "Midnight") is the **UI design guide for the mobile app**: tokens, components, screens, copy, accessibility and the demo fixture. Read it before building any screen. For mobile visuals it supersedes `.design/`; for requirements, the PRD wins.
- `docs/tech-stack.md` is the stack and its risks. `docs/adr/` holds the decisions. `docs/superpowers/plans/` holds the implementation plans.

## Workflow (Think → Build → Test → Review → Learn)

Each command below starts a Workflow script in `.claude/workflows/`. `docs/ai-system.md` explains the whole system. The owner starts every command and approves every plan and escalation.

1. **`/feature <PRD section>`**: `feature-analyze` turns the section into acceptance criteria, risks and open questions. Read the PRD section and the `credit-domain` skill, write the plan with superpowers `writing-plans` (`planner` is an optional second opinion), then **stop for owner approval**. This command plans; it does not build.
2. **`/build <plan path>`**: `feature-build` runs each task test-first. The order is `implementer`, then the `gate-checker` drift guard (at most 2 retries, then escalate), then the reviewers, then `finding-verifier`, then one fix pass. `qa` runs after the last task.
3. **`/qa <scope>`**: testers are picked by the changed paths. Only findings that `finding-verifier` confirms count.
4. **`/pr-review <PR#>`**: the G8 review. `pr-reviewer` posts the `pr-review` commit status. Before a plan's PR, run `/pr-review end-of-plan <plan path>`.
5. **Record:** `/journal` adds an entry in `docs/journal/`, and each run gets a ledger in `docs/agent-runs/`. This is evidence for the judges, so don't skip it.

Also:

- **`/bugfix <issue#>`**: root cause, then a RED regression test, then the fix, then a PR with `Fixes #N` and `/pr-review`. Use `--close` after the merge. **`/bug "<description>"`** only files the ticket.
- **`/retro`**: proposes agent-prompt edits from the run ledgers. The owner approves each one.
- **`/tidy`** and **`/worktrees`**: read-only reports.
- **`/verify`**: run it before every commit.

**Without a workflow** (a small change, or the Workflow runtime is unavailable), use the manual loop:

1. Read the PRD section and the `credit-domain` skill.
2. Plan with `writing-plans`.
3. Build test-first with superpowers `test-driven-development`.
4. Review with `typescript-reviewer`. Add `react-reviewer` for `.tsx`, `security-reviewer` when auth, PII, network or secrets are touched, and `silent-failure-hunter` for error paths.
5. Run `/verify`.
6. Run `/journal`.

## Who owns what

| Phase                                        | Owner                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brainstorm, plans, TDD, verification         | superpowers plugin (user-level)                                                                                                                                                            |
| Orchestration                                | `.claude/workflows/` (6 Workflow scripts), started only by `.claude/commands/`                                                                                                             |
| Analysis                                     | `.claude/agents/`: requirements-analyst, domain-checker, design-checker                                                                                                                    |
| Build and gates                              | implementer, gate-checker, test-automator; build-error-resolver (no workflow dispatches it yet)                                                                                            |
| Testing (they propose; test-automator lands) | functional-tester, edge-case-hunter, api-tester, ui-tester, integration-tester, security-reviewer                                                                                          |
| Review and verification                      | code-reviewer, consistency-reviewer, typescript-reviewer, react-reviewer, silent-failure-hunter, pr-test-analyzer, finding-verifier, pr-reviewer (posts G8), planner (plan second opinion) |
| Bugs                                         | bug-reporter, bug-analyst                                                                                                                                                                  |
| Ops and records                              | pm-sync (GitHub issues and board), journal-writer (ledgers and journal)                                                                                                                    |
| Domain knowledge                             | `credit-domain` skill                                                                                                                                                                      |
| Android E2E                                  | `maestro-android-e2e` skill                                                                                                                                                                |
| Admin E2E                                    | `e2e-testing` skill (Playwright)                                                                                                                                                           |
| Process evidence                             | `process-journal` skill, `/journal`, `docs/agent-runs/`                                                                                                                                    |

Several of the agents are adapted from affaan-m/ECC (MIT); see ADR 0002.

## Repo map

| Path              | What                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `packages/engine` | **Pure** TypeScript rules engine: utilization, planner, reporting dates, predictor, guard |
| `apps/mobile`     | Expo / React Native Android app (`com.creditcoach.app`)                                   |
| `apps/admin`      | Next.js admin control center (Playwright tests in `e2e/`)                                 |
| `supabase/`       | Migrations, seed and Edge Functions (hosted project, CLI-managed)                         |
| `.claude/`        | Agents, workflows, skills, rules, hooks and commands for this project                     |
| `docs/`           | PRD, tech stack, ADRs, plans, journal, test reports                                       |

## Commands

- `pnpm verify` runs lint, typecheck and unit tests for every workspace, failing fast.
- `pnpm --filter @credit-coach/engine test` runs the engine unit tests.
- `pnpm --filter @credit-coach/admin test:e2e` runs the Playwright tests (it builds and starts Next).
- `pnpm --filter @credit-coach/mobile android:release` builds and installs a standalone release APK on the running emulator or device.
- `pnpm --filter @credit-coach/mobile e2e` runs the Maestro flows in `apps/mobile/.maestro/`. Stop Metro first.
- Inside `apps/mobile`, use `npx expo install <pkg>`, not `pnpm add`. It picks SDK-compatible versions.

## Non-negotiables

1. **The engine is pure.** No I/O, no network, no `Date.now()` or `new Date()` without arguments. "Today" and all config are passed in. Same inputs, same outputs.
2. **The LLM never computes** amounts, dates or scores. It only words results the engine already computed. A template fallback always exists.
3. **Never show an exact predicted score.** Always a range plus reasons, clamped to 300–900, labelled as an estimate.
4. **Never advise closing a card** without warning about credit age and limit loss.
5. **PAN is never stored or logged in full.** Mask it in the UI (`ABXXXXX34F`). Record consent with a timestamp.
6. **No secrets in the repo.** Only `.env.example` is committed. Agents cannot write `.env*` files (a hook blocks it); ask the owner to fill them in. The Anthropic key lives only in Supabase Edge Function secrets.
7. **Commits and PRs carry no AI co-author or "Generated with" lines.** Use conventional commits.
8. **The demo path must work unaided:** "Try sample profile" with no sign-up, an on-screen demo OTP, and no SMS.
9. `docs/design.md` and `.design/` are owned by the design workflow. Read them for UI work, but don't modify them unless asked.

## Framework notes

- `apps/admin/AGENTS.md` (Next 16) and `apps/mobile/AGENTS.md` (Expo SDK 58) warn that these versions differ from training data. Read the bundled or versioned docs before using a framework API.
