# Agentic Dev System: Design

**Status:** Draft for owner review, 21 Oct 2026
**Owner:** Shubham Upadhyay
**Implements as:** Plan 1c, timeboxed to about one day (done by 23 Oct)
**Related:** `CLAUDE.md`, `.claude/`, ADR 0002, `docs/PRD.md` (product), `docs/design.md` (UI)

## 1. Why
- **The hackathon judges weigh the AI setup more than the product idea** (owner, 21 Oct). The brochure asks "how did AI help you build it?"
- The owner wants a **repeatable, reusable, multi-agent delivery system**:
  - specialised agents for analysis, building, testing (several kinds) and review
  - a coordinator that controls them
  - consistency enforcement, because AI output is non-deterministic
  - token discipline, drift control, retries and escalation
  - project management that agents keep up to date
- The better the setup, the easier every later feature is. Every remaining feature (UI kit, engine, backend, screens, admin) is built *through* this system, so the system gets exercised for real and leaves evidence.

## 2. Goals
1. **One command per feature:** analysis → plan (owner approves) → build → multi-angle QA → fix → record. It runs the same way every time.
2. **Specialist agents, each defined once in `.claude/agents/`.** They are reused by workflows, by commands, and by hand.
3. **Deterministic control.** A Workflow script, not an agent, decides what runs next. Agents never coordinate each other.
4. **Consistency by construction:**
   - every rule that *can* be machine-checked is a lint rule, a test or a CI gate
   - `docs/standards.md` holds only what can't
   - a consistency reviewer compares each change to standards plus a golden example
5. **Bounded cost:** a model tier per job, lean briefs, capped output, retries capped at 2, and a per-run cost record.
6. **A visible paper trail for judges:**
   - a GitHub Projects board
   - per-run agent ledgers
   - the journal
   - a SonarQube Cloud dashboard
   - a `/retro` history showing agents improving

## 3. Non-goals / anti-goals
- **Non-goal:** a general-purpose agent framework. This is built for this repo and these 9 days.
- **Non-goal:** fully autonomous delivery. The owner approves every plan and every escalation.
- **Anti-goal:** agents that loop silently, retry forever, or report "done" without evidence.
- **Anti-goal:** a setup so heavy that it stops features from shipping by 30 Oct. If a part isn't pulling its weight by 24 Oct, cut it.
- **Anti-goal:** duplicating superpowers. Superpowers' discipline skills (brainstorming, writing-plans, TDD, verification-before-completion) stay and are *used inside* agents. This system replaces only *how a feature is orchestrated*.

## 4. Hard constraints (verified 21 Oct)
| Constraint | Consequence |
|---|---|
| A Claude Code **subagent cannot start subagents** | The coordinator is a **Workflow script** run by the main session. A "feature agent" is a workflow, not an agent |
| Workflow `agent()` accepts `agentType` (a custom subagent from `.claude/agents/`), `schema` (validated structured output), `model`, `effort`, and `isolation: 'worktree'` | Specialists live in `.claude/agents/`. Every call has an output schema. Model and effort are set per role |
| Workflow scripts have **no file-system or Node API** and can't call `Date.now()`/`Math.random()` | Facts (diff, test results) are fetched by a cheap **gate agent** and **compared in script code**. Ledgers are written by the main session or the journal agent from the workflow's return value. Timestamps come in via `args` |
| A Workflow runs only on explicit opt-in. A slash command whose instructions call Workflow counts | `/feature`, `/build`, `/qa` and `/retro` are the opt-in triggers |
| `workflow()` can call other workflows, but only one level deep | `feature-build` can call `qa` inline; `qa` calls nothing |
| Concurrency is capped at about 10 parallel agents | QA fans out to at most 6 testers per run |
| Windows dev machine; the owner's `gh` default account is a work account | PM and CI commands use the ShubhamU55 token explicitly |

## 5. Agent roster

All agents live in `.claude/agents/<name>.md` and use one **agent template** (§6).
- "Writes" means the paths the agent may change. Anything else counts as drift (§8).
- **Model** is the default tier, which a workflow may override. H = Haiku 4.5, S = Sonnet 5, O = Opus 5.5.

| Group | Agent | Job | Writes | Model |
|---|---|---|---|---|
| Analyze | `requirements-analyst` **(new)** | PRD section → numbered acceptance criteria (given/when/then), open questions, out-of-scope list | nothing | S |
| | `domain-checker` **(new)** | Checks the criteria and plan against `credit-domain` facts F1–F7, planner order and anti-goals | nothing | S |
| | `design-checker` **(new)** | UI work only: checks against `docs/design.md` tokens, components, copy and accessibility; names which kit components to use | nothing | S |
| Plan | `planner` (have) | Second opinion on a plan written with superpowers `writing-plans` | nothing | O |
| Build | `implementer` **(new)** | Implements **one plan task** test-first (superpowers TDD), runs the task's tests, commits | the task's `Files:` list only | S |
| Gate | `gate-checker` **(new)** | Runs commands and reports facts: `git diff --name-only BASE..HEAD`, test command output, `pnpm verify` exit code, lint and Sonar summary. **No opinions** | nothing | H |
| Test | `functional-tester` **(new)** | Checks that every acceptance criterion has a test that would fail without the feature; adds missing ones | nothing (returns test proposals; `test-automator` commits) | S |
| | `edge-case-hunter` **(new)** | Boundaries only: zero, negative and huge amounts, empty lists, month-end and leap days, time zones, Unicode, 200% font scale, offline. Writes **property-based tests** (fast-check) for the engine | nothing (proposals → `**/*.edge.test.ts`, `**/*.property.test.ts`) | S |
| | `api-tester` **(new)** | Supabase: contract tests (Zod) for tables, RPCs and Edge Functions; RLS isolation (user A vs B vs anonymous sample); error codes; LLM timeout fallback | nothing (proposals → `supabase/tests/**`) | S |
| | `ui-tester` **(new)** | Maestro flows and screenshots vs `docs/design-mockups/v3`, touch targets ≥ 48, range never wraps, colour never the only signal, reduce-motion | `docs/test-reports/**` (screenshots); flows as proposals | S |
| | `integration-tester` **(new)** | Cross-component: app ↔ Supabase ↔ admin (rule change reaches the app), the demo path end to end (try sample → plan within 60 s) | nothing (proposals → `tests/integration/**`, `.maestro/**`) | S |
| | `security-reviewer` (have, **extended**) | Adds PAN masking and logging, consent records, RLS, secrets, OWASP Mobile Top 10, dependency audit | nothing (findings only) | S |
| Review | `pr-reviewer` **(new)** | In-depth PR review and the merge-gate verdict (G8, §8.9). Drives the `pr-review` workflow fan-out, then posts the verified findings and verdict to GitHub | GitHub review only | O, high effort |
| | `code-reviewer` (have) | General quality | nothing | S |
| | `consistency-reviewer` **(new)** | Compares the diff to `docs/standards.md` **and** to the golden example of the same kind (§7). Flags pattern drift | nothing | S |
| | `typescript-reviewer`, `react-reviewer`, `silent-failure-hunter` (have) | Specialist review | nothing | S |
| Verify | `finding-verifier` **(new)** | Adversarial: tries to **refute** one finding with evidence, defaulting to refuted when unsure. Only confirmed findings are fixed | nothing | S, high effort |
| Automate | `test-automator` **(new)** | Owns the **test automation infrastructure**. Turns acceptance criteria and tester proposals into durable automated tests in the right layer (Vitest, fast-check, Maestro, Playwright, API contract). Wires them into `pnpm verify` and CI. Triages flaky tests (quarantine with an issue, never silently skip). Keeps the test-layer README current | test files and dirs of every layer, `.github/workflows/**`, `vitest.config.*`, `playwright.config.*` | S |
| Ops | `pm-sync` **(new)** | Creates and updates GitHub issues and Project items from workflow results | GitHub only | H |
| | `journal-writer` **(new)** | Writes the run ledger and journal entry from the workflow result | `docs/journal/**`, `docs/agent-runs/**` | H |
| Retire | `tdd-guide` | Superseded by `implementer` + superpowers TDD | — | — |

## 6. Agent template (every agent file follows it)
```markdown
---
name: <kebab-name>
description: <one line: when the coordinator uses it>
tools: <minimal list; read-only agents get Read, Grep, Glob, Bash(read-only use)>
model: <haiku|sonnet|opus>
---
<!-- attribution line if adapted -->
## Mission        (2–3 sentences; the ONE job)
## Inputs         (what the brief contains; never "read the whole repo")
## Allowed paths  (writes; everything else is drift)
## Procedure      (numbered; names the skills to use)
## Output contract (must match the workflow's schema; evidence required for every claim)
## Stop rules     (when to stop and return status "blocked" with a reason, instead of guessing)
## Anti-drift     (do not refactor, rename, or "improve" outside the task; do not touch .env*; do not install packages unless the brief says so)
```

**Shared output envelope** (every agent's schema extends it):
```json
{ "status": "done | blocked | failed",
  "summary": "≤ 60 words",
  "filesTouched": ["…"],
  "evidence": [{"claim": "…", "command": "…", "output": "≤ 300 chars"}],
  "findings": [{"id": "…", "severity": "critical|important|minor", "file": "…", "line": 0, "title": "…", "detail": "≤ 80 words", "suggestedFix": "…"}],
  "blockedReason": "…" }
```

## 7. Consistency: deterministic first, AI second
1. **ESLint**, with these additions to the root and app configs:
   - **Import boundaries** via `no-restricted-imports`: `packages/engine` may not import `react*`, `@supabase/*`, `expo*` or `next*`; apps may not import each other.
   - The engine may not call `Date.now()` or argless `new Date()` (`no-restricted-syntax`).
   - No raw hex colours outside `apps/mobile/src/ui/theme/**` (the existing kit test, plus a lint rule).
   - Naming rules via `@typescript-eslint/naming-convention`: components PascalCase; hooks `use*`; boolean props `is*`/`has*`/`show*`.
   - `max-lines` 400 (warn) and `complexity` 10 (warn).
2. **Prettier** (exists) plus the format-on-edit hook (exists).
3. **SonarQube Cloud**, free for public repos:
   - analysis runs in CI on every push and PR
   - **quality gate:** 0 new bugs, 0 new vulnerabilities, security hotspots reviewed, duplication on new code < 3%, engine coverage on new code ≥ 90%
   - the README carries the badge
   - agents read issues through the SonarQube MCP server if connected, otherwise the Web API through `gate-checker`
4. **`docs/standards.md`** holds only what lint can't check:
   - folder layout per package
   - error-handling pattern (typed results in the engine; boundary validation with Zod)
   - money in **integer rupees**, dates as `YYYY-MM-DD` strings
   - component pattern (presentational kit, plus screens composing it)
   - testID convention
   - test naming
   - commit and PR format
   - **golden examples:** one reference file per kind (engine function, engine test, UI component, component test, screen, Maestro flow, Playwright spec, Supabase migration, Edge Function). It starts with the files we have, and a better file replaces the example when one lands.
5. **`consistency-reviewer`** runs on every task. Its findings are verified like any other finding.

## 8. Control: the coordinator loop

### 8.1 Workflows (saved in `.claude/workflows/`)
| Workflow | Trigger | Phases |
|---|---|---|
| `feature-analyze` | `/feature <PRD §>` | requirements-analyst ∥ domain-checker ∥ design-checker (UI only) → merged **analysis brief** (criteria, risks, kit components, open questions). **Returns to the main session**, which writes the plan with superpowers `writing-plans`, optionally gets a `planner` second opinion, and **stops for owner approval** |
| `feature-build` | `/build <plan path>` (after approval) | for each task in order: `implementer` → `gate-checker` → retry or escalate → `code-reviewer` ∥ `consistency-reviewer` (+ ts/react reviewers by file type) → findings → `finding-verifier` → one fix pass by `implementer` → `gate-checker`. After all tasks: `workflow('qa')` inline |
| `qa` | `/qa <scope>`, or called by `feature-build` | pick testers by the changed paths (table below) → run them in parallel → dedupe findings → `finding-verifier` per finding → return confirmed findings plus test counts |
| `pr-review` | `/pr-review <PR#>`, or automatically when a ticket PR is opened or updated | spec, correctness, security, consistency, test-adequacy, silent-failure and UI lenses in parallel → dedupe → `finding-verifier` → post the review and verdict (G8) |
| `retro` | `/retro` | read recent run ledgers → per agent: false-positive rate, retries, tokens, escalations → propose prompt edits as a diff for owner approval |

**Tester selection by changed path:**

| Changed path | Testers |
|---|---|
| `packages/engine/**` | functional, edge-case |
| `supabase/**` | api, security, integration |
| `apps/mobile/**` | functional, ui, edge-case (UI inputs), security if auth or PAN is touched |
| `apps/admin/**` | functional, integration, security |
| any | security (diff-scoped, cheap) |

**After QA (resolves the reviewer's Q2)** [Call]:
- **Testers propose; `test-automator` commits.** Testers return test *proposals*, each with a test name, its layer, the assertion and the criterion it covers, plus any findings. They write nothing, so parallel testers can't conflict. `test-automator` then lands the accepted proposals in one commit per layer.
- **A new test that fails** goes to `finding-verifier`:
  - If the test matches the PRD or design, it becomes a product **finding**.
  - If not, the test is wrong and is dropped, with the reason logged.
- **Fix pass:** confirmed findings go to `implementer` in one fix pass. Its allowed paths are the files named in the confirmed findings plus their tests. Then `gate-checker` runs. Anything still failing **escalates** (§8.3).
- **The emulator is shared.** Device-bound runs (Maestro by `ui-tester` and `integration-tester`) run **one after another**, never in parallel.

**End-of-plan review (resolves Q5)** [Call]: a real phase. When a plan's branch is ready, `code-reviewer` runs on **Opus**. It sees the whole plan diff plus the plan and the spec, and it checks the plan's Review Focus list deliberately. Its findings go through the same verify → fix flow.

### 8.2 The drift guard
After every `implementer` run, `gate-checker` reports facts, and the **script** compares them:
1. `filesTouched` (from git, **not** the implementer's claim) ⊆ the task's allowed `Files:` list, plus its test files.
2. The task's named test command ran, and its output shows them passing.
3. `pnpm verify` exits 0.
4. The commit message matches the conventional-commit format and has no AI attribution lines.

Any failure means the attempt **failed**, with the specific reason recorded, whatever the agent's own `status` says.

### 8.3 Retries and escalation
- **At most 2 retries per agent step.** Each retry's brief includes the exact failure reason and the gate output.
- **After that, escalate.** The workflow stops that task and returns `{status: 'escalated', task, attempts: [...], reasons: [...]}`. The main session presents it to the owner with three options:
  - re-split the task
  - switch the agent or model
  - the owner decides
- Tasks that depend on an escalated task are skipped; independent ones continue.
- **Testers and reviewers don't retry.** A malformed result is dropped, and the drop is logged with `log()`. No silent caps.
- **A `null` agent result** (skipped or died) counts as a failed attempt.

### 8.4 Token policy
- **Model tiers per §5.** Haiku for gate, PM and journal work; Sonnet for build, test and review; Opus only for plan second opinions and the end-of-plan review.
- **Briefs, not context dumps:** the task text, its interfaces, the allowed paths and one golden example. Agents get `CLAUDE.md` automatically; prompts never paste it.
- **Output caps** in schemas: summary ≤ 60 words, finding detail ≤ 80 words, evidence output ≤ 300 chars.
- **Path-selected testers** (§8.1), so unchanged areas aren't re-tested.
- **Verify before fix:** only findings confirmed by `finding-verifier` reach the fix pass.
- **Per-run cost record:** agents, retries and escalations (from the workflow), plus tokens (`budget.spent()` where available) go into the ledger. `/retro` uses it to find wasteful agents.

## 8.5 Branches, worktrees and parallel sessions (owner requirement: several Claude sessions building at once)
- **One ticket = one branch = one worktree = one session.**
  - Each session runs in its own git worktree: `git worktree add ../cc-<issue#> -b feat/<issue#>-<slug>`.
  - Then `pnpm install` (the pnpm store makes this quick after the first time), then `claude` in that folder.
  - Sessions never share a checkout.
- **`BASE`** for the drift guard is the ticket branch's fork point from `main` (`git merge-base main HEAD`).
- **A failed attempt is undone** with `git reset --hard <attempt-start>` on the ticket branch. The rest of the work stays on that branch.
- **Each ticket merges through a PR to `main`.** CI and the SonarQube quality gate are **required checks**. Merge method and approver: see §13 (owner question).
- `Closes #N` in the PR body closes the ticket when the PR merges.
- **Tickets are designed for parallel work.** `pm-sync` and the planner must produce:
  1. **Disjoint file ownership.** Each ticket lists the files it may touch. Two tickets that can run at the same time never share a file.
  2. **Contracts first.** Shared types and interfaces (engine types, Supabase schema, the UI kit barrel) land as a small "contract" ticket before the tickets that consume them, so consumers code against something stable.
  3. **Hotspot files have one owner:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/workflows/**`, barrel `index.ts` files and app routing. Changes to them are batched into a per-wave **"integration" ticket**, or follow an append-only convention (one export line per ticket, at the end of the file).
  4. **Dependency waves.** Tickets are grouped into waves: wave N depends only on waves < N. Everything inside a wave can run in parallel. The board has a `Wave` field.
  5. **Claiming.** A session claims a ticket by moving it to *In progress* with the `session:<worktree>` label. A claimed ticket isn't picked up by another session.
- **New dependencies** are added only by the wave's integration ticket. That avoids lockfile merge conflicts.

## 8.6 Repository hygiene and temporary artifacts (owner requirement: everything committed and reviewable)
- **Everything durable is committed:**
  - code, tests, docs and plans
  - agent definitions, workflows, skills and hooks
  - run ledgers (`docs/agent-runs/`), test reports and screenshots (`docs/test-reports/`)
  - journal entries
  
  Judges review the repo, so the repo is the record.
- **Temporary artifacts are committed too, under `scratch/`, with an expiry.** This covers throwaway scripts, spikes, investigation notes and one-off data. Each item carries a header (a front-matter block or a top comment):
  ```
  purpose: <why this exists>
  owner: <ticket #>
  created: YYYY-MM-DD
  expires: YYYY-MM-DD   # default created + 7 days
  keep-if: <condition that would make it permanent>
  ```
- **Lifecycle:**
  - When a scratch item proves useful, it is **promoted**: moved into its proper home (`scripts/`, `docs/`, tests), with the header removed.
  - Otherwise it is **deleted** by its expiry. Deletion is a normal commit (`chore(scratch): remove expired <name>`), so history still shows it existed.
- **Enforcement:**
  - A Vitest check in the hooks/tooling package fails if any `scratch/**` file lacks the header.
  - A `/tidy` command, run by the `janitor` role of `journal-writer`, lists expired scratch items and stale docs (docs that reference files or symbols that no longer exist) and proposes deletions for owner approval.
  - CI warns on expired items. It doesn't fail on them, so an expiry never breaks a build.
- **What stays local, never committed:**
  - secrets (`.env*`)
  - build outputs (`node_modules`, `.next`, `android/`, `*.apk`)
  - per-session execution scratch (`.superpowers/`)
  
  At the end of each plan, the SDD ledger from `.superpowers/` is **copied into `docs/agent-runs/`**, so the evidence is kept.

## 8.7 Supabase test environment (resolves the reviewer's Q4) [Call]
- `api-tester` and `integration-tester` run against a **local Supabase** (`supabase start` in Docker Desktop on the owner's machine; in CI, `supabase start` on the Ubuntu runner).
- Agents may freely create and delete users and data there. Local keys come from `supabase status`, not `.env` files.
- **The hosted project is used only for read-only smoke checks** and the demo. Agents never write test data to it.

## 8.8 SonarQube gate (resolves the reviewer's Sonar notes) [Call]
- The **engine's 90% line coverage is enforced by Vitest coverage thresholds**. That's deterministic, and it fails `pnpm verify` and CI.
- SonarQube Cloud uses its default **"Sonar way"** gate, because custom gates may not be on the free plan. It sets `sonar.coverage.exclusions=apps/**`, since the apps are covered by E2E flows, not a percentage.
- Sonar way's "no new issues" condition is stricter, and we accept that.

## 9. Project management: GitHub Projects (default; owner may switch to Jira)
- **Board:** "Credit Coach" (Projects v2) on ShubhamU55.
  - Columns: Backlog → Ready → In progress → Review → Done, plus Blocked.
  - Custom fields: Plan, Task #, Agent, Attempts, Est. vs actual.
- **Milestones:** one per plan (Foundation, Agentic system, Engine, Backend, UI kit, Screens, Admin, Submission).
- **One issue per plan task.** It's created by `pm-sync` when a plan is approved, with the body linking the plan section. Labels: `area:*`, `agent:*`, `blocked`, `escalated`.
- **Updates:** `pm-sync` moves cards at each workflow phase and comments the gate evidence. Commits use `Refs #N` / `Closes #N`.
- **Auth:** the ShubhamU55 token needs `project` and `workflow` scopes. The owner runs `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project`.

## 10. Evidence for judges
- `docs/agent-runs/<YYYY-MM-DD>-<slug>.md` per workflow run: agents used, attempts, gate results, findings (confirmed vs refuted), cost record.
- `docs/journal/`, written per feature by `journal-writer`.
- The `/retro` history: agent prompt changes, each committed with the data that justified it.
- The SonarQube Cloud dashboard and CI badges in the README.
- The Projects board linked from the README.
- A short `docs/ai-system.md`, a one-page diagram and explanation of this system for judges.

## 11. Rollout and validation (within Plan 1c)
1. Standards plus lint rules plus the Sonar CI gate go in first: they're deterministic and cheap.
2. Agents are written from the template.
3. The workflows are written, then **dry-run on one small real task**: Plan 4a Task 2 (engine formatters). This proves the full loop, including one forced drift and one forced retry, on low-risk code.
4. Fix what the dry run reveals, then use the system for all remaining plans.

**Cut order if 23 Oct slips:**
- `retro` workflow → later
- `integration-tester` → merged into functional-tester
- `ui-tester` screenshot diffing → manual review
- Board custom fields → plain columns

## 13. Owner decisions (21 Oct)
1. **Merge model: agent-reviewed, gate-enforced.** Every PR passes the merge gates in §8.9, including an **in-depth PR review agent**. A PR merges only when every gate is green.
2. **Money unit: integer rupees** everywhere (engine, API, DB, UI). Inputs with paise are **rounded half-up to whole rupees at the boundary** (bureau import, manual entry), and the rounding is shown to the user only if it changes a displayed number. `formatINR(rupees)` stays as Plan 4a Task 2 defines it. `docs/standards.md` and the `credit-domain` skill say "integer rupees".
3. **Security is a first-class gate (§8.10).** A security leak in the product would be judged harshly.
4. **Reuse the maximum from affaan-m/ECC.** A second reuse map against this design drives which ECC agents, commands, skills and hooks are adopted (§14).

## 8.9 Merge gates (required status checks on `main`)
A PR to `main` can't merge until **all** of these pass:

| # | Gate | Kind | Blocks on |
|---|---|---|---|
| G1 | `verify`: lint, typecheck, unit and property tests, engine coverage ≥ 90% | CI | any failure |
| G2 | `admin-e2e` (Playwright) when `apps/admin/**` or `packages/engine/**` changed | CI | any failure |
| G3 | `api`: Supabase contract and RLS tests against local Supabase, when `supabase/**` changed | CI | any failure |
| G4 | `secrets`: gitleaks over the PR's commits | CI | any finding |
| G5 | `deps`: `pnpm audit --audit-level=high` plus OSV scan | CI | high or critical advisories (with a documented, dated allow-list) |
| G6 | `codeql`: GitHub CodeQL for JS/TS (free on public repos) | CI | new high or critical alerts |
| G7 | **SonarQube Cloud** quality gate (Sonar way) | CI | gate failed |
| G8 | **`pr-reviewer` verdict.** The in-depth PR review agent posts a GitHub review: **approve** or **request changes**. Request-changes blocks | Agent | any confirmed critical or important finding |
| G9 | **Maestro evidence** when `apps/mobile/**` changed: the PR must include an updated `docs/test-reports/maestro-*.xml` showing all flows passed on a release APK. CI checks the file exists and is newer than the last mobile change | CI (file check) | missing or failed |

- **`pr-reviewer` (new agent, Opus, high effort)** reviews the PR in depth. It fans out *through the `pr-review` workflow*:
  - Spec conformance: PRD or design section vs diff.
  - Correctness and edge cases.
  - Security: runs `security-reviewer`.
  - Consistency: runs `consistency-reviewer` against standards and golden examples.
  - Test adequacy: does every acceptance criterion have a test that would fail without the change?
  - Silent failures.
  - UI and accessibility (if mobile changed).
  
  Every finding then goes through `finding-verifier`. The **confirmed** findings become inline PR comments plus a summary review. The verdict is posted with the ShubhamU55 token as a PR review, and a `pr-review` commit status records it so branch protection can require it.
- **Merge:**
  - With G1–G9 green and an approving `pr-reviewer` review, the PR **auto-merges** (squash, via `gh pr merge --auto --squash`).
  - Any request-changes review returns the PR to the ticket's session for a fix pass. After the fix, the `pr-review` workflow re-runs, scoped to the new commits plus the previous findings.
  - **Two request-changes rounds on the same PR escalate to the owner.**
- **The owner can always override:** a `hold` label blocks auto-merge.
- **Branch protection on `main`:** required checks G1–G9, linear history, no force-push, no direct pushes after the bootstrap commit.

## 8.10 Security as a first-class gate
- **Threat model:** `docs/security/threat-model.md`, a one-page STRIDE pass over the app, admin, Supabase, the LLM Edge Function and the demo path. The `security-reviewer` checklist is derived from it.
- **Product rules:**
  - No secrets in the app bundle. Only the Supabase **anon** key ships; the **service role** key never leaves server-side.
  - RLS on **every** table, deny-by-default. A test asserts that every table in the schema has RLS enabled.
  - PAN is never stored in full (hash + last 4) and never logged. A test greps log statements for PAN patterns.
  - Consent is recorded with a timestamp.
  - The LLM function treats all input as untrusted and returns only template-bounded text. It has a timeout and rate limiting.
  - The admin requires an admin-role claim, enforced server-side.
  - Mobile: no sensitive data in plain AsyncStorage (session tokens use `expo-secure-store`). No HTTP. No debug logs in release builds.
  - Checked against the **OWASP MASVS** and the OWASP Mobile Top 10 checklist in `docs/security/checklist.md`.
- **Pipeline:** G4 (secrets), G5 (dependencies), G6 (CodeQL), G7 (Sonar security hotspots), plus `security-reviewer` inside `pr-reviewer` on every PR. `api-tester` runs RLS isolation tests on every Supabase change.
- **Agent-config security:** agents must not be steerable into leaking secrets or disabling hooks.
  - The `protect-env` hook (exists) blocks agent writes to `.env*` files.
  - A **config audit** (ECC AgentShield or equivalent, per §14) scans `.claude/` on every PR that touches it.
  - Agents never run `--no-verify` or disable hooks.
- **Before submission:** a full security pass by `security-reviewer` on Opus over the whole repo. Findings and their fixes are recorded in `docs/security/review-YYYY-MM-DD.md`.

## 14. ECC reuse (to be filled from the second reuse map)
_A table of ECC agents, commands, skills and hooks adopted for each role in this design, with adapt notes. Pending the reuse-map report._

## 12. Left to the builder
- Exact JSON schemas per agent (extending the §6 envelope).
- Wording of the agent prompts within the template.
- Which ESLint naming patterns produce too much noise (start at warn, promote to error once clean).
- The SonarQube project key and organization name.
- How the main session renders escalations (a plain table is fine).
