# Plan 1c: Agentic Dev System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the repo's multi-agent delivery system from the approved spec. It covers:

- deterministic gates: lint, coverage, CI, Sonar
- specialist agents
- Workflow coordinators with a drift guard, retries and escalation
- the bug lifecycle
- merge gates
- evidence for judges

Then prove the core loop on one real task before building the rest.

**Architecture:**

- **Deterministic first.** Every rule a machine can check is a lint rule, a Vitest test or a CI job. These land in Wave 0, before any agent exists.
- **One contract module, copied verbatim.** Workflow scripts can't import, read files or call `Date.now()`. So the shared decision logic lives in `.claude/hooks/lib/contracts.mjs`, which holds the schemas, severity, dedupe, verifier policy, drift guard and retry policy. Each workflow carries a **byte-identical copy** of that module's `// <contracts>` block, and a test fails if any copy differs. Workflow-specific logic sits in a `// <pure>` block that the tests load through `vm`, with the clock stubbed to throw.
- **Agents propose and gate, scripts decide.** `gate-checker` (Haiku) runs git and test commands and returns facts. The workflow script compares those facts against the task's allowed files. Agents never coordinate each other.
- **Core loop first.** Waves 1–2 build only what `feature-build` and `qa` need, then dry-run them on Plan 4a Task 2. Waves 3–4 add analysis, bugs, PR review and ops on a loop that is already proven.

**Tech Stack:**

- Claude Code: agents, commands, hooks and Workflow scripts (plain JS)
- Vitest 5 and `@vitest/coverage-v8`; `fast-check`; ESLint 9 flat config with typescript-eslint 8; `yaml` for config tests
- GitHub Actions: `dorny/paths-filter`, gitleaks, CodeQL, OSV-Scanner, the SonarQube Cloud scan action
- `gh` CLI with the ShubhamU55 token

**Spec:** [docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md](../specs/2026-10-21-agentic-dev-system-design.md) (approved 21 Oct). Section numbers below (§n) refer to it.

## Global Constraints

- **ECC source:** affaan-m/ECC @ `90606c8`, MIT. Local clone: `C:\Users\55\AppData\Local\Temp\claude\C--Users-55\0c8b837c-b945-411d-969a-049e4d8d584f\scratchpad\ecc`. If it's gone, clone `https://github.com/affaan-m/ECC` and check out `90606c8`.
- **Attribution:** every adapted file carries `<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->` in Markdown, or `// Adapted from affaan-m/ECC (MIT) @ 90606c8` in JS, directly after any frontmatter.
- **Agent files follow the §6 template.** The default model tier comes from the roster table below. The sections are `## Mission`, `## Inputs`, `## Allowed paths`, `## Procedure`, `## Output contract`, `## Stop rules` and `## Anti-drift`, in that order.
- **Prompt Defense Baseline** (the ECC block):
  - required in every agent that has no `Write` or `Edit` tool
  - forbidden in `implementer`, `test-automator` and `build-error-resolver` (§14.5)
- **Severity is one enum everywhere:** `critical | high | medium | low`.
  - **Blocking** means `critical` or `high`.
  - This maps the spec's envelope values: `important` → `high`, `minor` → `medium`/`low`. Record the mapping in `docs/standards.md`.
- **Output caps (in schemas):** `summary` ≤ 420 chars (~60 words), finding `detail` ≤ 560 chars (~80 words), evidence `output` ≤ 300 chars.
- **Workflow scripts:**
  - Plain JS (no TypeScript), no `import`.
  - No `Date.now()`, `Math.random()` or argless `new Date()`. Timestamps arrive in `args`.
  - Saved as `.claude/workflows/<name>.workflow.js`. The W2-1 spike confirms this name; if the CLI only discovers `<name>.js`, rename the files and update `WORKFLOW_GLOB` in `lib/pure-block.mjs`.
  - Never use `isolation: 'worktree'` for `implementer`. Its commits must land on the ticket branch.
- **Hooks:** ECC CommonJS hooks are saved as `.cjs`. Vendored files over 800 lines get a top comment: `Vendored from ECC; exempt from the 800-line ceiling (coding-style.md)`.
- **Commits:**
  - Conventional commits, types `feat|fix|refactor|docs|test|chore|perf|ci`.
  - Subject ≤ 72 chars.
  - **No `Co-Authored-By` or "Generated with" lines** (CLAUDE.md rule 7 overrides any harness default).
- **gh as ShubhamU55:** prefix with `GH_TOKEN=$(gh auth token --user ShubhamU55)`. Never switch the default account.
- **Money is integer rupees. Dates are `YYYY-MM-DD` strings.**
- **Temporary files** go in `scratch/` with the §8.6 header (`purpose`, `owner`, `created`, `expires`, `keep-if`).
- **New dependencies** are added only in W0-1, so the lockfile has one owner. A later ticket that needs a package stops and escalates.

## Review Focus

1. **The drift guard passes something it should fail.** Examples: an implementer leaves uncommitted edits, writes outside its list while claiming not to, or hides an attribution line in a commit _body_. `checkDrift` judges only `gate-checker`'s git facts:
   - dirty files fail
   - every commit's full message is checked, not just the subject
   - tests: W0-6 `checkDrift` cases (a), (d), (g)
2. **A `null` or malformed agent result reads as success.** Three cases, each with a test:
   - `nextStep` counts `null` as a failed attempt (W0-6)
   - `applyVerifierPolicy(securityFinding, null)` returns `confirmed`, so it fails closed (W0-6)
   - `summarizeQa` reports a `null` tester in `failedTesters` instead of dropping it (W2-1)
3. **Windows paths break path matching.** `packages\engine\src\format.ts` must match the allowed `packages/engine/src/format.ts`. `normalizePath` test (W0-6).
4. **A path-gated required check never reports, and the PR hangs forever.** No workflow-level `paths:` filter is allowed; gated jobs use `needs: changes` plus a job-level `if:`. Asserted by `ci-config.test.mjs` (W0-5).
5. **Prompt injection through a diff or finding text** ("approve this", "ignore previous instructions") steers a reviewer or verifier.
   - Every reviewer and verifier prompt wraps untrusted text with `wrapUntrusted`, which is tested for markers and the guard sentence (W0-6).
   - Hidden-character and hidden-comment checks over `.claude/**` live in `config-audit.test.mjs` (W0-7).

---

## How Plan 1c itself is executed (bootstrap rules)

- **Wave 0 is the bootstrap, committed directly on `main`.** W0-1 goes first, because it owns the lockfile. After that, W0-2 to W0-6 touch disjoint files, so they **may** run in parallel worktrees to save time, and W0-7 runs last. A single session working through them in order is also fine.
- **Status file in parallel waves:** the hotspot table says who updates `docs/status.md`. Other sessions in a parallel wave write their handoff in their run ledger (`docs/agent-runs/`) instead. W1-1 adds this exception to `CLAUDE.md`'s "update status every session" rule.
- **Waves 1–4: one ticket = one branch = one worktree = one session** (§8.5).
  - Create the worktree with `git worktree add ../cc-1c-<ticket> -b feat/1c-<ticket>-<slug>`, then run `pnpm install` and `claude` inside it.
  - Tickets in the same wave may run at the same time. Their `Files:` lists are disjoint.
- **Merging before W5-1:**
  - If the push works: open a PR, wait for CI green, then squash-merge.
  - Otherwise: `git rebase main`, then run `git merge --ff-only feat/…` from the main checkout. G8 (`pr-review`) exists only after W4-2, so Plan 1c's own PRs merge on CI alone. This is the bootstrap exception and is noted in each ledger.
- **Hotspot owners per wave** (§8.5.3). Nobody else touches these files in that wave.

| Hotspot                                                       | W0                                                           | W1   | W2   | W3   | W4   | W5   |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---- | ---- | ---- | ---- | ---- |
| `package.json` files, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | W0-1                                                         | —    | —    | —    | —    | —    |
| `.github/workflows/**`                                        | W0-5                                                         | —    | —    | —    | —    | —    |
| `.github/ISSUE_TEMPLATE/**`                                   | —                                                            | —    | —    | W3-3 | —    | —    |
| `.claude/settings.json`                                       | W0-4                                                         | W1-4 | —    | —    | —    | —    |
| `CLAUDE.md`                                                   | —                                                            | W1-1 | —    | —    | W4-5 | —    |
| `README.md`                                                   | —                                                            | —    | —    | —    | W4-5 | W5-2 |
| `docs/status.md`                                              | W0-7                                                         | —    | W2-2 | —    | W4-5 | W5-2 |
| `THIRD_PARTY_NOTICES.md`                                      | no change: the existing ECC notice covers every adapted file |      |      |      |      |      |

**Waves and dependencies**

| Wave                 | Tickets (parallel within the wave)                                                                                               | Depends on        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 0 Bootstrap (serial) | W0-1 tooling and deps · W0-2 ESLint · W0-3 standards · W0-4 housekeeping · W0-5 CI and Sonar · W0-6 contracts · W0-7 repo checks | —                 |
| 1 Core agents        | W1-1 build/gate · W1-2 verify/consistency · W1-3 test · W1-4 security and hooks                                                  | W0                |
| 2 Core loop          | W2-1 `feature-build` + `qa` workflows · then W2-2 dry run (serial)                                                               | W1                |
| 3 More agents        | W3-1 analyze · W3-2 api/ui/integration testers · W3-3 bugs · W3-4 PR review and ops                                              | W2-2              |
| 4 Workflows and docs | W4-1 `feature-analyze` · W4-2 `pr-review` · W4-3 `bugfix` · W4-4 `retro`/`tidy` · W4-5 docs for judges                           | W3                |
| 5 Owner-gated        | W5-1 push, Sonar, branch protection · W5-2 board                                                                                 | owner actions, W4 |

**Cut line on 24 Oct** (§11), in this order:

1. W4-4's retro workflow and `/worktrees`
2. `integration-tester` (fold it into `functional-tester`)
3. `ui-tester` screenshot diffing
4. the board's custom fields

## Owner actions (manual; they unblock W5)

1. Run `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project`.
2. **SonarQube Cloud:**
   - Sign in with GitHub, then create the organization `shubhamu55` (record the actual key) and import `credit-coach`.
   - **Turn off Automatic Analysis.** It conflicts with CI analysis.
   - Generate a token, then add it as the repo secret `SONAR_TOKEN`: `gh secret set SONAR_TOKEN --repo ShubhamU55/credit-coach`.
3. Start Docker Desktop. This isn't needed by Plan 1c, but `api-tester` in Plan 3 needs it.

## Agent roster (what each agent file must declare)

Tools are the minimum set. **"Nothing"** means a read-only agent (the agent lint enforces this). "Extras" are the output fields added to the §6 envelope that every agent returns.

| Agent                  | Ticket | Source                                                            | Tools                               | Model  | Allowed paths                                                                                                  | Extras                                                                     |
| ---------------------- | ------ | ----------------------------------------------------------------- | ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `implementer`          | W1-1   | new                                                               | Read, Write, Edit, Bash, Grep, Glob | sonnet | the brief's `Files:` list plus its test files                                                                  | `commit`, `predictedFiles[]`                                               |
| `gate-checker`         | W1-1   | new                                                               | Bash, Read                          | haiku  | Nothing                                                                                                        | `facts` (GATE_FACTS)                                                       |
| `build-error-resolver` | W1-1   | ECC `agents/build-error-resolver.md` (npx → pnpm)                 | Read, Write, Edit, Bash, Grep, Glob | sonnet | the brief's `Files:` list                                                                                      | `commit`                                                                   |
| `finding-verifier`     | W1-2   | new; prompt adapted from ECC `verifyPrompt`                       | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | VERDICT (replaces the envelope)                                            |
| `consistency-reviewer` | W1-2   | new                                                               | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | —                                                                          |
| `functional-tester`    | W1-3   | new                                                               | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | `proposals[]`                                                              |
| `edge-case-hunter`     | W1-3   | new                                                               | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | `proposals[]` (layer `property` for the engine)                            |
| `test-automator`       | W1-3   | new                                                               | Read, Write, Edit, Bash, Grep, Glob | sonnet | test files of every layer, `.github/workflows/**`, `vitest.config.*`, `playwright.config.*`, `docs/testing.md` | `landed[]`                                                                 |
| `requirements-analyst` | W3-1   | new (WHEN/THEN + Invariant format from ECC `spec-miner`)          | Read, Grep, Glob                    | sonnet | Nothing                                                                                                        | `criteria[]`, `openQuestions[]`, `outOfScope[]`                            |
| `domain-checker`       | W3-1   | new                                                               | Read, Grep, Glob                    | sonnet | Nothing                                                                                                        | —                                                                          |
| `design-checker`       | W3-1   | new; checklist from ECC `a11y-architect` + `skills/accessibility` | Read, Grep, Glob                    | sonnet | Nothing                                                                                                        | `kitComponents[]`                                                          |
| `api-tester`           | W3-2   | new; RLS checklist from ECC `database-reviewer`                   | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | `proposals[]`                                                              |
| `ui-tester`            | W3-2   | new                                                               | Read, Write, Grep, Glob, Bash       | sonnet | `docs/test-reports/**`                                                                                         | `proposals[]`, `screenshots[]`                                             |
| `integration-tester`   | W3-2   | new                                                               | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | `proposals[]`                                                              |
| `bug-analyst`          | W3-3   | new                                                               | Read, Write, Grep, Glob, Bash       | sonnet | `docs/test-reports/bugs/<issue#>/**`, the GitHub issue                                                         | `reproduced`, `rootCause`, `blastRadius[]`, `fixFiles[]`, `regressionTest` |
| `bug-reporter`         | W3-3   | new                                                               | Read, Write, Grep, Glob, Bash       | haiku  | `docs/test-reports/bugs/**`, GitHub issues                                                                     | `issueNumber`, `duplicateOf`, `evidencePaths[]`                            |
| `pr-reviewer`          | W3-4   | new; lens set from ECC `commands/review-pr.md`                    | Read, Grep, Glob, Bash              | opus   | Nothing in the repo; GitHub review and commit status only                                                      | `verdict`, `reviewUrl`                                                     |
| `pr-test-analyzer`     | W3-4   | ECC `agents/pr-test-analyzer.md`                                  | Read, Grep, Glob, Bash              | sonnet | Nothing                                                                                                        | —                                                                          |
| `pm-sync`              | W3-4   | new; card schema from ECC `skills/team-agent-orchestration`       | Bash, Read                          | haiku  | Nothing in the repo; GitHub issues and Projects only                                                           | `issues[]`                                                                 |
| `journal-writer`       | W3-4   | new; handoff template from ECC `commands/checkpoint.md`           | Read, Write, Edit, Bash, Grep, Glob | haiku  | `docs/journal/**`, `docs/agent-runs/**`                                                                        | `ledgerPath`, `journalPath`                                                |

The kept ECC agents (`code-reviewer`, `typescript-reviewer`, `react-reviewer`, `silent-failure-hunter`, `planner`, `security-reviewer`) are **legacy**. They need frontmatter, attribution and the baseline, but not the §6 sections. `tdd-guide` is deleted in W1-1.

---

## Wave 0: Bootstrap (serial, on `main`)

### Task W0-1: Tooling package and new dependencies (Wave 0 integration ticket)

**Files:**

- Modify: `packages/engine/package.json`
  - `test` → `vitest run --coverage`
  - devDeps `@vitest/coverage-v8`, `fast-check`
- Modify: `packages/engine/vitest.config.ts`
- Modify: `.claude/hooks/package.json`
  - description → `Claude Code hooks and agent-system tooling (contracts, repo checks, CLIs).`
  - devDep `yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces:
  - the engine coverage gate (lines ≥ 90, `lcov` at `packages/engine/coverage/lcov.info`)
  - `fast-check` available to engine tests
  - `yaml` available to tooling tests

- [ ] **Step 1: Configure coverage** in `vitest.config.ts`:
  - `coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts', 'src/index.ts'], reporter: ['text', 'lcov'], thresholds: { lines: 90 } }`
  - Install from the repo root with `pnpm --filter @credit-coach/engine add -D @vitest/coverage-v8 fast-check` and `pnpm --filter @credit-coach/hooks add -D yaml`.
- [ ] **Step 2: Prove the threshold bites.**
  - Temporarily append `export const probe = (n: number): number => n + 1;` to `packages/engine/src/utilization.ts`, then run `pnpm --filter @credit-coach/engine test`.
  - Expected: FAIL with `ERROR: Coverage for lines (…%) does not meet global threshold (90%)` (the probe is the only uncovered code, so it must push lines under 90% in this tiny package; if not, add a second probe line).
  - Remove the probe.
- [ ] **Step 3:** Run `pnpm verify`. Expected: exit 0, and the engine coverage table is printed.
- [ ] **Step 4: Commit** `chore: add engine coverage gate, fast-check and tooling deps`.

### Task W0-2: ESLint rules (§7.1)

**Files:**

- Create: `eslint.shared.cjs`
- Modify: `eslint.config.mjs`, `apps/mobile/eslint.config.js`, `apps/admin/eslint.config.mjs`
- Test: `.claude/hooks/tests/eslint-rules.test.mjs`

**Interfaces:**

- Produces: `eslint.shared.cjs` exports
  - `engineRestrictedImports`: a `no-restricted-imports` options object
  - `noArglessDate`: `no-restricted-syntax` entries
  - `noRawHex`: `no-restricted-syntax` entries
  - `crossAppImport(otherApp: 'mobile' | 'admin')`: `no-restricted-imports` options
  - `sizeLimits`: `{ 'max-lines': ['warn', 400], complexity: ['warn', 10] }`

The values these must pin:

- **engine imports:** `react`, `react-*`, `react-native*`, `@supabase/*`, `expo`, `expo-*`, `next`, `next/*`, `fs`, `node:*`, `http`, `https`, `child_process`
- **argless Date selectors:**
  - `NewExpression[callee.name='Date'][arguments.length=0]`
  - `CallExpression[callee.object.name='Date'][callee.property.name='now']`
- **raw hex selector:** `Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]`. It applies to `src/**/*.{ts,tsx}` in mobile, ignoring `src/ui/theme/**`.
- **Naming (mobile, warn, no type info):** `@typescript-eslint/naming-convention` with `typeLike` → PascalCase, and `variable` → camelCase | PascalCase | UPPER_CASE.
  - **Decision (§12):** boolean props are _not_ linted for `is*`/`has*`/`show*`. A syntactic rule can't separate them from RN core props (`disabled`, `visible`), and Plan 4a's approved interfaces use those names.
  - The prefix rule lives in `docs/standards.md` for new domain booleans.
- Each `no-restricted-syntax` config object sets _all_ entries for its files. Flat config replaces the rule's options rather than merging them, so don't split the entries across objects.

- [ ] **Step 1: Write the failing tests.** Use `new ESLint({ cwd })` and `lintText(code, { filePath })`, with `cwd` set to the package dir:
  - `engine rejects argless new Date()`: `packages/engine`, `src/x.ts`, `export const t = new Date();` → one error, ruleId `no-restricted-syntax`
  - `engine rejects Date.now()` → error
  - `engine allows new Date('2026-10-21')` → 0 errors
  - `engine rejects react and node:fs imports` → 2 errors, ruleId `no-restricted-imports`
  - `mobile rejects a raw hex literal in a component`: `apps/mobile`, `src/ui/components/X.tsx`, `const c = '#FFAA00';` → error
  - `mobile allows hex inside src/ui/theme/color.ts` → 0 errors
  - `mobile rejects importing @credit-coach/admin` → error
  - `admin rejects importing @credit-coach/mobile` → error
  - `a 401-line engine file warns max-lines` → severity 1, not 2
- [ ] **Step 2:** Run `pnpm --filter @credit-coach/hooks test -- eslint-rules`. Expected: FAIL (rules missing).
- [ ] **Step 3: Implement** `eslint.shared.cjs` and wire it into the three configs.
  - The root config applies the engine rules to `packages/engine/src/**/*.ts` only.
  - The mobile config loads it with `require('../../eslint.shared.cjs')`.
  - The admin config loads it with `import shared from '../../eslint.shared.cjs'`.
- [ ] **Step 4:** Run the tests, then `pnpm lint`. Expected: tests PASS, and lint exits 0 with warnings allowed.
- [ ] **Step 5: Commit** `chore(lint): enforce engine purity, import boundaries and raw-hex ban`.

### Task W0-3: `docs/standards.md` and golden examples (§7.4)

**Files:**

- Create: `docs/standards.md`
- Modify: `packages/engine/src/utilization.ts` (doc comment only: replace "paise works too" with "inputs are integer rupees")

**Interfaces:**

- Produces: standards section anchors that `consistency-reviewer` cites:
  - `#layout`, `#errors`, `#money-and-dates`, `#components`, `#testids`, `#test-naming`, `#commits-and-prs`, `#severity`, `#golden-examples`

- [ ] **Step 1: Write `docs/standards.md`** (≤ 150 lines). It holds only what lint can't check:
  - folder layout per package
  - typed results in the engine; Zod at boundaries
  - integer rupees, rounded half-up at the boundary; dates as `YYYY-MM-DD`
  - the presentational kit plus screens composing it
  - testID convention (from Plan 4a); test naming
  - commit and PR format
  - the severity enum and its mapping
  - boolean prop prefixes for new domain props
- [ ] **Step 2: The golden-examples table** has one row per kind, each with a path or `none yet: first lands in <plan/task>`:
  - engine function → `packages/engine/src/utilization.ts`
  - engine test → `packages/engine/src/utilization.test.ts`
  - Playwright spec → `apps/admin/e2e/smoke.spec.ts`
  - Maestro flow → `apps/mobile/.maestro/smoke.yaml`
  - UI component, component test and screen → Plan 4a
  - Supabase migration and Edge Function → Plan 3
  - Add one line: "a better file replaces the example when it lands."
- [ ] **Step 3: Check the links.** Every path in the table that isn't `none yet` exists: `rg -o '\x60[a-z].*?\.(ts|tsx|yaml)\x60' docs/standards.md` and check each one by hand.
- [ ] **Step 4:** Run `pnpm verify`. Expected: exit 0.
- [ ] **Step 5: Commit** `docs: add standards and golden examples`.

### Task W0-4: Housekeeping from §14.5 and the settings baseline

**Files:**

- Modify: `.claude/rules/code-review.md`
  - Trim the python/go/rust rows.
  - Fix the `agents.md` link.
  - Cut it to ≤ 80 lines by removing generic duplication of `coding-style.md`.
- Create: `.claude/rules/agents.md`, `.claude/rules/development-workflow.md`. Adapt them from ECC `rules/common/` (with attribution) and point them at our roster and workflows.
- Modify: `.claude/settings.json`
- Test: `.claude/hooks/tests/settings.test.mjs`

**Interfaces:**

- Produces: the `permissions.deny` baseline and attribution settings that W1-4 extends (hooks only).

- [ ] **Step 1: Write the failing test.** `settings.json`:
  - has `permissions.deny` containing exactly these entries, plus any others:
    - `Read(**/.env)`, `Read(**/.env.local)`, `Read(**/.env.*.local)`, `Read(**/.env.production)`
    - `Read(~/.ssh/**)`, `Read(~/.aws/**)`
    - `Bash(curl * | sh*)`, `Bash(curl * | bash*)`, `Bash(wget * | sh*)`
    - `Bash(* --no-verify*)`, `Bash(git push --force*)`, `Bash(git push -f*)`
  - has `includeCoAuthoredBy === false`
  - has `attribution.commit === ''` and `attribution.pr === ''`
- [ ] **Step 2:** Run `pnpm --filter @credit-coach/hooks test -- settings`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check the installed CLI's settings docs for the attribution keys. Keep every key it recognises. If one is unknown, drop it and adjust the test.
- [ ] **Step 4: Verify.** Run the tests (expected PASS). Then, in a fresh `claude` session, run `/permissions` and confirm the deny rules are listed.
- [ ] **Step 5: Commit** `chore(ai): trim review rule, add deny baseline and no-attribution settings`.

### Task W0-5: CI gates G1, G2, G4, G5, G6, G7 and G9, plus Sonar (§7.3, §8.8, §8.9)

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/codeql.yml`, `.github/workflows/hold.yml`, `sonar-project.properties`, `osv-scanner.toml`
- Create: `.claude/hooks/lib/maestro-evidence.mjs`, `.claude/hooks/bin/maestro-evidence.mjs`
- Create: `.claude/hooks/lib/scratch.mjs`, `.claude/hooks/bin/scratch-expiry.mjs`
- Test:
  - `.claude/hooks/tests/ci-config.test.mjs`
  - `.claude/hooks/lib/maestro-evidence.test.mjs`
  - `.claude/hooks/lib/scratch.test.mjs`

**Interfaces:**

- Produces these job ids. W5-1 reads the **actual** check-run names from the first green run and requires those; it doesn't assume the ids.
  - `changes`, `verify`, `admin-e2e`, `secrets`, `deps`, `sonar`, `maestro-evidence` (in `ci.yml`)
  - `hold-check` (in `hold.yml`, its own concurrency group, so label changes don't cancel and re-run CI)
  - `codeql` (in `codeql.yml`)
- `checkMaestroEvidence({ reports: Array<{ path: string, xml: string, afterLastMobileChange: boolean }> }): { ok: boolean, reason: string }`
  - The bin computes `afterLastMobileChange` by **ancestry, not timestamps**, because a rebase rewrites committer dates: `git merge-base --is-ancestor <last commit touching apps/mobile> <commit that last touched the report>`.
  - The newest qualifying report must pass.
- `parseScratchHeader(text: string): { purpose, owner, created, expires, keepIf } | null`
- `isExpired(header, todayIso: string): boolean`

- [ ] **Step 1: Write the failing tests.**
  - `ci-config.test.mjs`, which parses the three workflow files with `yaml`:
    - no workflow has `paths` or `paths-ignore` under `on`
    - `ci.yml`'s `on.pull_request.types` does **not** include `labeled`/`unlabeled`
    - `hold.yml` triggers on `labeled`, `unlabeled`, `opened`, `synchronize` and `reopened`, and has its own `concurrency.group`
    - all job ids above exist
    - `admin-e2e` and `maestro-evidence` have `needs: changes` and an `if:` containing `needs.changes.outputs`
    - `hold-check`'s failing step is conditioned on the `hold` label
    - `codeql.yml` analyzes `javascript-typescript`
    - `sonar-project.properties` sets `sonar.qualitygate.wait=true`
  - `maestro-evidence.test.mjs`:
    - `no report` → `ok:false`
    - `report not after the last mobile change` (`afterLastMobileChange:false`) → `ok:false`
    - `failures="1"` → `ok:false`
    - `tests="0"` → `ok:false`
    - `newest report, tests="3" failures="0" errors="0"` → `ok:true`
    - a `<testsuites>` root and a `<testsuite>` root both parse
  - `scratch.test.mjs`:
    - header parsed from front-matter and from a `//` comment block
    - missing `expires` → `null`
    - `isExpired({expires:'2026-10-28'}, '2026-10-29')` → `true`; `'2026-10-28'` → `false`
- [ ] **Step 2:** Run `pnpm --filter @credit-coach/hooks test`. Expected: FAIL.
- [ ] **Step 3: Implement the CI.**
  - **`changes`:** `dorny/paths-filter@v3` with outputs:
    - `admin: ['apps/admin/**','packages/engine/**']`
    - `mobile: ['apps/mobile/**']`
    - `supabase: ['supabase/**']`
  - **`verify`:** unchanged, plus a step `node .claude/hooks/bin/scratch-expiry.mjs`, which prints `::warning::` per expired item and always exits 0.
  - **`admin-e2e`:** gated on `needs.changes.outputs.admin == 'true'`.
  - **`deps`:**
    - `pnpm audit --audit-level=high`
    - `google/osv-scanner-action` over the lockfile
    - allow-lists: `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` (only if a finding forces it; each entry with a dated comment), and `[[IgnoredVulns]]` with `ignoreUntil` in `osv-scanner.toml`
  - **`sonar`:**
    - `pnpm --filter @credit-coach/engine test`, then the SonarQube Cloud scan action
    - every step `if: env.SONAR_TOKEN != ''`; otherwise a `::warning::Sonar skipped: SONAR_TOKEN not set` step
  - **`maestro-evidence`:** PR only, gated on `mobile`, `fetch-depth: 0`, runs `node .claude/hooks/bin/maestro-evidence.mjs`. It uses the ancestry rule above.
  - **`hold-check`** (in `hold.yml`): `exit 1` when `contains(github.event.pull_request.labels.*.name, 'hold')`.
  - **`sonar-project.properties`:**
    - `sonar.projectKey=ShubhamU55_credit-coach`
    - `sonar.organization=shubhamu55` (W5-1 corrects it if the owner's key differs)
    - `sonar.qualitygate.wait=true`. Without it, the scan step passes even when the gate fails, so G7 would block nothing.
    - `sonar.sources=.` and `sonar.tests=.`
    - `sonar.exclusions=**/node_modules/**,**/coverage/**,docs/**,.design/**,.claude/hooks/*.cjs,.claude/hooks/lib/*.cjs,apps/mobile/android/**,**/*.test.ts,**/*.test.tsx,**/*.test.mjs,apps/admin/e2e/**`. The test globs are listed here too, so no file is indexed as both source and test.
    - `sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.test.mjs,apps/admin/e2e/**`
    - `sonar.coverage.exclusions=apps/**,.claude/**,supabase/**,scripts/**,**/*.config.*,eslint.shared.cjs`
    - `sonar.javascript.lcov.reportPaths=packages/engine/coverage/lcov.info`
- [ ] **Step 4:** Run `pnpm --filter @credit-coach/hooks test` (expected: PASS), then `pnpm verify` (expected: exit 0).
- [ ] **Step 5: Commit** `ci: add path-gated gates, deps audit, CodeQL, Sonar and Maestro check`.

### Task W0-6: Agent-system contracts (shared decision logic, tested once)

**Files:**

- Create: `.claude/hooks/lib/contracts.mjs`, `.claude/hooks/lib/pure-block.mjs`, `.claude/hooks/lib/plan-tasks.mjs`, `.claude/hooks/bin/plan-tasks.mjs`
- Test:
  - `.claude/hooks/lib/contracts.test.mjs`
  - `.claude/hooks/lib/pure-block.test.mjs`
  - `.claude/hooks/lib/plan-tasks.test.mjs`
  - `.claude/hooks/tests/workflows-sync.test.mjs`

**Interfaces:**

- **`contracts.mjs` layout.** One block between the lines `// <contracts>` and `// </contracts>`, holding plain declarations with no `export`. After the block comes a single `export { … }` line. Workflows paste the block verbatim.
- **Constants:**
  - `SEVERITIES = ['critical','high','medium','low']`
  - `CATEGORIES = ['correctness','security','consistency','test-adequacy','silent-failure','ui','spec','domain','performance']`
  - `COMMIT_TYPES = ['feat','fix','refactor','docs','test','chore','perf','ci']`
  - `MAX_RETRIES = 2`
  - `CONFIDENT = 0.8`
- **`FINDING_SCHEMA`:**
  - required: `id, severity, category, file, title, detail, evidence`
  - optional: `line` (integer|null), `proof`, `suggestedFix`, `foundBy`
  - `proof` is required when severity ∈ {critical, high}, via `allOf` if/then as in ECC
- **`envelopeSchema(extraProperties = {}, extraRequired = [])`:** returns the §6 envelope schema (`status ∈ done|blocked|failed`, `summary`, `filesTouched`, `evidence[]`, `findings[]` of FINDING_SCHEMA, `blockedReason`) merged with the extras.
- **`VERDICT_SCHEMA`:** `{ isReal: boolean, confidence: number 0..1, reasoning: string }`, all required.
- **`GATE_FACTS_SCHEMA`:** `{ head, attemptStart, changedFiles[], dirtyFiles[], missingFiles[], commits[{ sha, message }], testCommand, testExitCode, testOutputTail, verifyExitCode }`.
- **Functions:**
  - `normalizePath(p: string): string`: backslashes → `/`, strips a leading `./`. **Case is kept.**
  - `matchesAllowed(path: string, patterns: string[]): boolean`: exact match, or glob with `*` (one segment) and `**` (any depth).
  - `isBlocking(f): boolean`: severity is critical or high.
  - `dedupeFindings(findings): Finding[]`:
    - key = `file|line` when `line` is an integer, else `file|normalizedTitle`
    - keeps the strictest severity
    - unions `foundBy`
    - keeps first-seen order
  - `applyVerifierPolicy(finding, verdict | null): 'confirmed' | 'refuted'`:
    - security-category or critical findings: `refuted` only if `verdict.isReal === false && confidence >= CONFIDENT`; a `null` verdict → `confirmed`
    - otherwise: `confirmed` only if `verdict.isReal === true && confidence >= CONFIDENT`; a `null` verdict → `refuted`
  - `checkCommitMessage(message: string): string[]`, returning reasons:
    - `commit-format: <subject>` when the subject fails `^(type)(\([a-z0-9-]+\))?!?: .+` or is over 72 chars
    - `commit-attribution: <subject>` when any line matches `/^co-authored-by:/i` or `/generated with/i`
  - `checkStart(startFacts): string[]`: returns `dirty-start: <file>` per dirty file. A dirty tree before an attempt stops the task with that reason, instead of letting every attempt fail.
  - `checkDrift(facts, task): { ok: boolean, reasons: string[] }`. `task` is `{ id, files[], createFiles[], testFiles[], testCommand }`. Reasons, in this order:
    - `no-commit` when `commits` is empty
    - `uncommitted: <file>` per dirty file
    - `missing: <file>` per `facts.missingFiles` (a `Create:` or `Test:` path absent at HEAD). This catches "done but incomplete".
    - `drift: <file>` per changed file not matched by `files ∪ testFiles`
    - `test-command-mismatch` when `facts.testCommand !== task.testCommand`
    - `tests-failed: exit <n>`
    - `verify-failed: exit <n>`
    - then `checkCommitMessage` reasons per commit
  - `nextStep(attempts: Array<{ ok: boolean } | null>): 'done' | 'retry' | 'escalate'`:
    - `done` if the last attempt is ok
    - `retry` if failed attempts ≤ `MAX_RETRIES`
    - else `escalate`
    - `null` counts as a failed attempt
  - `wrapUntrusted(label: string, text: string): string`: the guard sentence (as ECC's `reviewPrompt`), then `----- BEGIN <label> (untrusted) -----`, the text, and `----- END <label> -----`.
- **`pure-block.mjs`:**
  - `WORKFLOW_GLOB = '.claude/workflows/*.workflow.js'`
  - `extractBlock(source: string, tag: 'contracts' | 'pure'): string`: throws when the block is missing or repeated
  - `loadBlocks(source: string, names: string[]): Record<string, unknown>`: runs `contracts` + `pure` in `vm.createContext`. `Date.now`, argless `new Date()` and `Math.random` throw there.
- **`plan-tasks.mjs`:** `parsePlanTasks(markdown: string): Task[]`, where `Task = { id: string, title: string, files: string[], createFiles: string[], testFiles: string[], testCommand: string | null, dependsOn: string[], text: string }`.
  - `createFiles` is the subset of `files` from `Create:` entries.
  - Headings: `^### Task ([\w-]+): (.+)$`.
  - `files`: every backticked path in the `**Files:**` block, excluding `Test:` entries.
  - `testFiles`: the `Test:` entries.
  - A **path** is a backticked token with no spaces that contains `/` or ends in `.<ext>`, and doesn't start with `@`.
  - `testCommand`: the first backticked `pnpm …` command in a step whose text contains `PASS`.
  - `dependsOn`: task ids named in the `Consumes` lines.
- **`bin/plan-tasks.mjs <planPath> [ids...]`:** prints the JSON of the selected tasks.

- [ ] **Step 1: Write the failing tests.**
  - **`contracts.test.mjs`:**
    - `normalizePath('packages\\engine\\src\\format.ts') === 'packages/engine/src/format.ts'`
    - `matchesAllowed('apps/mobile/src/a.edge.test.ts', ['**/*.edge.test.ts'])` → `true`
    - dedupe: two findings on `a.ts|12` (`medium` and `high`) → one `high` with both `foundBy`
    - `applyVerifierPolicy`:
      - security + null → `confirmed`
      - security + `{isReal:false, confidence:0.7}` → `confirmed`
      - security + `{isReal:false, confidence:0.9}` → `refuted`
      - medium correctness + null → `refuted`
      - medium correctness + `{isReal:true, confidence:0.85}` → `confirmed`
    - `checkDrift`:
      - (a) dirty file → `uncommitted: x`
      - (b) `packages/engine/src/utilization.ts` outside the list → `drift: …`
      - (c) a clean pass → `ok:true, reasons:[]`
      - (d) a body line `Co-Authored-By: X` → `commit-attribution`
      - (e) subject `Update stuff` → `commit-format`
      - (f) `testExitCode:1` → `tests-failed: exit 1`
      - (g) no commits → `no-commit`
      - (h) `missingFiles:['packages/engine/src/format.test.ts']` → `missing: packages/engine/src/format.test.ts`
    - `checkStart({dirtyFiles:['.design/x']})` → `['dirty-start: .design/x']`
    - `nextStep`:
      - `[{ok:true}]` → `done`
      - `[{ok:false}]` → `retry`
      - `[{ok:false}, null, {ok:false}]` → `escalate`
    - `wrapUntrusted('DIFF','x')` contains both markers and `untrusted input`
    - every schema satisfies `required ⊆ properties`
  - **`pure-block.test.mjs`:**
    - extracting a block from a fixture string works
    - a missing block throws
    - a block calling `Date.now()` throws when loaded
  - **`plan-tasks.test.mjs`:**
    - Plan 4a, Task `2` → `files: ['packages/engine/src/format.ts','packages/engine/src/index.ts']`, `testFiles: ['packages/engine/src/format.test.ts']`, `testCommand: 'pnpm --filter @credit-coach/engine test'`
    - this plan: the ids include `W0-1` and `W5-2`
  - **`workflows-sync.test.mjs`:**
    - for each file matching `WORKFLOW_GLOB`, the `contracts` block equals `extractBlock(contracts.mjs, 'contracts')`
    - the file contains no `Date.now(`, `Math.random(` or `new Date()`
    - it passes vacuously when no workflows exist yet
- [ ] **Step 2:** Run `pnpm --filter @credit-coach/hooks test`. Expected: FAIL.
- [ ] **Step 3: Implement** the three modules and the bin.
- [ ] **Step 4:** Run `pnpm --filter @credit-coach/hooks test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): add agent-system contracts, pure-block loader and plan parser`.

### Task W0-7: Repo checks: agent lint, config audit and scratch headers

**Files:**

- Test:
  - `.claude/hooks/tests/agents-lint.test.mjs`
  - `.claude/hooks/tests/config-audit.test.mjs`
  - `.claude/hooks/tests/scratch-headers.test.mjs`
- Create: `scratch/README.md` (the header rules, with the header itself as the example)
- Modify: `docs/status.md`

**Interfaces:**

- Consumes: `parseScratchHeader` (W0-5).
- Produces: the checks every later agent file must pass, as listed in the "Agent roster" preamble:
  - `LEGACY = ['code-reviewer','typescript-reviewer','react-reviewer','silent-failure-hunter','planner','security-reviewer']`
  - `BUILDERS = ['implementer','test-automator','build-error-resolver']`

- [ ] **Step 1: Write the tests.**
  - **`agents-lint`**, for each `.claude/agents/*.md`:
    - frontmatter has `name` equal to the filename, plus `description`, `tools` and `model ∈ {haiku, sonnet, opus}`
    - non-legacy agents have the 7 §6 headings in order
    - if the first line under `## Allowed paths` starts with `Nothing`, `tools` contains none of `Write`, `Edit`, `MultiEdit` or `NotebookEdit`
    - a file mentioning `affaan-m/ECC` has the exact attribution line
    - an agent without `Write` or `Edit` has `## Prompt Defense Baseline`; `BUILDERS` don't
    - `## Anti-drift` mentions `.env` and `--no-verify`
  - **`config-audit`**, over every file in `.claude/**` and `CLAUDE.md`. Fail on:
    - any char in `U+200B–U+200F`, `U+202A–U+202E`, `U+2066–U+2069` or `U+FEFF`
    - `ANTHROPIC_BASE_URL`
    - `(curl|wget)[^\n|]*\|\s*(sh|bash)` outside fenced code blocks and outside the line in `tdd-workflow/SKILL.md` that warns against it (allow-list it by path + line text)
    - `<!--` outside fenced code blocks, unless it's the attribution comment or listed in the allow-list `{ path, startsWith, reason }`
    - Seed the allow-list with `app-security-review/SKILL.md` and its `<!-- Do not write a literal dollar-sign-N` comment.
  - **`scratch-headers`:** every file under `scratch/**` has a header that `parseScratchHeader` accepts.
- [ ] **Step 2:** Run `pnpm --filter @credit-coach/hooks test`. Expected: PASS for the legacy agents and the current `.claude/` contents. If a check fails on existing content, fix the content (not the check), unless it's a deliberate allow-list entry with a reason.
- [ ] **Step 3: Prove each check bites.**
  - Add a scratch agent file with `tools: Read, Write` and `Allowed paths` = `Nothing`. Expected: FAIL. Remove it.
  - Add a U+200B to a temp `.claude/x.md`. Expected: FAIL. Remove it.
- [ ] **Step 4: Check the tree is clean after verification.** Run `pnpm verify && git status --porcelain`. Expected: empty output. Generated files such as `tsbuildinfo` or `coverage/` must be gitignored, or every drift-guard attempt would fail with `uncommitted:`.
- [ ] **Step 5: Update `docs/status.md`.** Wave 0 is done; next is Wave 1.
- [ ] **Step 6: Commit** `test(ai): add agent lint, config audit and scratch header checks`.

---

## Wave 1: Core agents (4 parallel tickets)

Each ticket writes agent files that match its roster rows. Each agent's `## Output contract` names the envelope extras and the workflow schema that will validate them. The shared verification for every Wave 1 ticket:

- Run `pnpm --filter @credit-coach/hooks test`. Expected: PASS, with the agent lint covering the new files.
- In a fresh `claude` session in the worktree, `/agents` lists the new agents.

### Task W1-1: Build and gate agents; retire `tdd-guide`

**Files:**

- Create: `.claude/agents/implementer.md`, `.claude/agents/gate-checker.md`, `.claude/agents/build-error-resolver.md`
- Delete: `.claude/agents/tdd-guide.md`
- Modify:
  - `.claude/rules/testing.md`: point it at `implementer` and `test-automator`
  - `.claude/rules/react-native.md`: line 177 → `implementer`
  - `CLAUDE.md`: drop `tdd-guide` from the ownership table

**Interfaces:**

- Produces:
  - **`gate-checker` modes**, selected by the brief's first line:
    - `MODE: start` returns `facts.head` and `facts.dirtyFiles` only.
    - `MODE: check <attemptStart>` returns the full GATE_FACTS. It takes `git status --porcelain` **first**, before tests or `pnpm verify` can regenerate files:
      - `git status --porcelain`
      - `git diff --name-only <attemptStart>..HEAD`
      - `git cat-file -e HEAD:<path>` for each path in the brief's `EXPECT:` list (→ `missingFiles`)
      - `git log --format=%H%x00%B%x01 <attemptStart>..HEAD`
      - the brief's test command
      - `pnpm verify` exit code
      - output tails ≤ 300 chars
  - **`implementer` brief contract.** Its own brief never asks for out-of-scope work; dry-run faults come from a separate injector agent (W2-1). The first line is `RESET TO <sha>` on a retry. The implementer runs `git reset --hard <sha>` first; it is the only agent that resets.
    - It predicts `predictedFiles` before editing (ECC `change-impact`).
    - It uses superpowers TDD.
    - It makes one commit per task.

- [ ] **Step 1: Write the three agents** to the template. `build-error-resolver` is adapted from ECC: replace `npx` with `pnpm`, and give it **no** baseline.
- [ ] **Step 2: Edit the rules and `CLAUDE.md`** as listed. Also add the parallel-wave exception to `CLAUDE.md`'s "Start here" rule: a session that doesn't own `docs/status.md` in its wave writes its handoff in its run ledger. Then run `rg -n tdd-guide .claude CLAUDE.md`. Expected: no matches.
- [ ] **Step 3: Shared verification** (above).
- [ ] **Step 4: Commit** `feat(ai): add implementer, gate-checker, build-error-resolver`.

### Task W1-2: `finding-verifier` and `consistency-reviewer`

**Files:**

- Create: `.claude/agents/finding-verifier.md`, `.claude/agents/consistency-reviewer.md`

**Interfaces:**

- Consumes: VERDICT_SCHEMA and `applyVerifierPolicy` semantics (W0-6); the `docs/standards.md` anchors (W0-3).
- Produces:
  - **`finding-verifier`** judges one finding against the evidence it can read. Its procedure tells it to try to _refute_ the finding, and states the §14.4 policy so its confidence is calibrated.
  - **`consistency-reviewer`** compares the diff to the cited standards anchor and to the golden example of the same kind. Every finding carries `category: 'consistency'` and names the anchor.

- [ ] **Step 1:** Write both agents.
- [ ] **Step 2: Shared verification.** Also hand-run `finding-verifier` once through the Agent tool on a fabricated finding against `utilization.ts`. Expected: a VERDICT-shaped answer that refutes it.
- [ ] **Step 3: Commit** `feat(ai): add finding-verifier and consistency-reviewer`.

### Task W1-3: Test agents

**Files:**

- Create: `.claude/agents/functional-tester.md`, `.claude/agents/edge-case-hunter.md`, `.claude/agents/test-automator.md`, `docs/testing.md`

**Interfaces:**

- Produces:
  - **Proposal shape** (used by `qa` and `test-automator`): `{ name, layer: 'vitest'|'property'|'maestro'|'playwright'|'api', file, assertion, criterion }`.
  - **`edge-case-hunter`** targets these files:
    - `**/*.edge.test.ts`
    - `**/*.property.test.ts`, which uses fast-check
  - **`test-automator`** lands accepted proposals with one commit per layer. It quarantines flaky tests: `it.skip` plus a linked issue number in the skip reason, never a silent skip.
  - **`docs/testing.md`**: one table, layer → tool → location → command → gate.

- [ ] **Step 1:** Write the three agents and `docs/testing.md`.
- [ ] **Step 2: Shared verification.**
- [ ] **Step 3: Commit** `feat(ai): add functional-tester, edge-case-hunter and test-automator`.

### Task W1-4: Security docs, extended `security-reviewer`, ECC hooks

**Files:**

- Create: `docs/security/threat-model.md`, `docs/security/checklist.md`
- Modify: `.claude/agents/security-reviewer.md`. Add a `## Credit Coach checklist` section pointing to `docs/security/checklist.md`:
  - PAN masking and logging, consent timestamp
  - RLS deny-by-default, using the ECC `database-reviewer` RLS list
  - secrets; MASVS / OWASP Mobile Top 10; dependency audit
- Create (from ECC `scripts/hooks/`):
  - `.claude/hooks/block-no-verify.cjs`, `.claude/hooks/lib/shell-scan.cjs`
  - `.claude/hooks/pre-bash-commit-quality.cjs`
  - `.claude/hooks/config-protection.cjs`
- Modify: `.claude/settings.json` (hook registration only)
- Test: `.claude/hooks/tests/ecc-hooks.test.mjs`, `.claude/hooks/tests/hooks-registration.test.mjs`

**Interfaces:**

- **Adaptations:**
  - `pre-bash-commit-quality.cjs` `validateCommitMessage` uses our `COMMIT_TYPES` and rejects `Co-Authored-By` and "Generated with".
  - `config-protection.cjs` wraps its stdin listener in `if (require.main === module)`, and also protects `.claude/settings.json`.
  - The `require('./lib/shell-scan')` paths are updated to `.cjs`.
- **Registration:**
  - PreToolUse `Bash` → `node .claude/hooks/block-no-verify.cjs` and `node .claude/hooks/pre-bash-commit-quality.cjs`
  - PreToolUse `Write|Edit|MultiEdit` → `node .claude/hooks/config-protection.cjs`, **registered last**, after every other edit in this ticket

- [ ] **Step 1: Write `threat-model.md`** (one page, STRIDE over the app, admin, Supabase, the LLM Edge Function and the demo path) and **`checklist.md`** (derived from the threat model and §8.10's product rules, one checkbox per rule). Each rule names the plan whose test will enforce it: the RLS-on-every-table test and the PAN-in-logs grep land in Plan 3; `expo-secure-store` and no release debug logs land in Plan 4b. The threat model also records the **G8 trust gap**: anyone holding the ShubhamU55 token can post a `pr-review` success status. That is accepted for the hackathon, mitigated by the owner's `hold` label and the pre-submission security pass.
- [ ] **Step 2: Write the failing tests.**
  - `ecc-hooks.test.mjs`:
    - `block-no-verify` `run()` on `{"tool_input":{"command":"git commit --no-verify -m x"}}` → `exitCode 2`; on `git commit -m x` → `0`
    - `validateCommitMessage('git commit -m "feat: x\n\nCo-Authored-By: A"')` returns an issue
    - `style: x` returns an issue (not one of our types)
    - `config-protection` spawned with `eslint.config.mjs` (exists) → exit 2; with `src/a.ts` → exit 0
  - `hooks-registration.test.mjs`: `settings.json` registers all three commands, with config-protection last under `Write|Edit|MultiEdit`.
- [ ] **Step 3:** Run `pnpm --filter @credit-coach/hooks test`. Expected: FAIL.
- [ ] **Step 4: Copy and adapt** the hooks (attribution, plus the 800-line header where needed). Extend `security-reviewer`. Register the hooks in `settings.json`, with config-protection last.
- [ ] **Step 5:** Run the tests. Expected: PASS. Then in a fresh session, ask the agent to run `git commit --allow-empty --no-verify -m "chore: x"`. Expected: blocked by the hook.
- [ ] **Step 6: Commit** `feat(security): add threat model, checklist and ECC guard hooks`.

---

## Wave 2: Core loop and dry run

### Task W2-1: `feature-build` and `qa` workflows, `/build` and `/qa`

**Files:**

- Create:
  - `.claude/workflows/feature-build.workflow.js`, `.claude/workflows/qa.workflow.js`
  - `.claude/commands/build.md`, `.claude/commands/qa.md`
- Test: `.claude/hooks/tests/workflows/feature-build.test.mjs`, `.claude/hooks/tests/workflows/qa.test.mjs`

**Interfaces:**

- Consumes: the whole W0-6 contracts block (pasted verbatim), `parsePlanTasks` via `bin/plan-tasks.mjs`, and the W1 agents.
- **`qa` workflow:**
  - args: `{ scope: string, changedFiles: string[], diff: string, criteria?: string[] }`
  - Returns `{ confirmed: Finding[], refuted: number, proposals: Proposal[], failedTesters: string[], counts: { testers, raw, unique, confirmed, refuted } }`.
  - `pure` block:
    - `selectTesters(changedFiles): string[]`:
      - follows the §8.1 table
      - order: `functional-tester, edge-case-hunter, api-tester, ui-tester, integration-tester, security-reviewer`
      - always includes `security-reviewer`
      - capped at 6
    - `splitDeviceBound(testers): { parallel: string[], serial: string[] }`: `ui-tester` and `integration-tester` go to `serial`
    - `summarizeQa(results: Array<{ tester, result | null }>, verdicts): QaResult`: a `null` result goes to `failedTesters`
  - **Missing agents.** A tester whose agent file doesn't exist yet (before W3-2) returns `null`. It is logged with `log()` and listed in `failedTesters`.
- **`feature-build` workflow:**
  - args: `{ planPath, specPaths: string[], tasks: Task[], dryRun?: { faults: Array<'drift'|'tests'> } }`
  - Returns `{ status: 'done'|'partial'|'escalated', tasks: Array<{ id, status: 'done'|'escalated'|'skipped', attempts: Array<{ n, ok, reasons, commit }>, confirmed: Finding[], refuted: number }>, qa: QaResult | null, stats: { agents, retries, escalations, tokens } }`.
  - `pure` block:
    - `classifySize(task): 'trivial'|'small'|'standard'|'large'`:
      - trivial = docs-only
      - small ≤ 2 non-test files
      - standard 3–6
      - large > 6
    - `reviewersFor(task, size): string[]`:
      - trivial → `[]`
      - small → `code-reviewer`, `consistency-reviewer`
      - otherwise also `typescript-reviewer` if any `.ts`/`.tsx`/`.mjs`/`.cjs` changed, `react-reviewer` if any `.tsx` changed, and `silent-failure-hunter`
    - `implementerBrief(task, attemptStart, lastFailure | null): string`:
      - the first line is `RESET TO <attemptStart>` when `lastFailure` is set
      - it includes the failure reasons, the allowed files and the golden-example path for the task's kind
    - `faultBrief(fault: 'drift' | 'tests', task): string`. Dry run only; it's given to a `general-purpose` fault-injector agent that runs **after** the implementer, so the faults are deterministic and the implementer's brief stays clean:
      - `drift`: append `// dry-run drift probe` to `packages/engine/src/utilization.ts` and commit `chore: dry-run drift probe`
      - `tests`: append `it('dry-run fault', () => expect(1).toBe(2));` to `task.testFiles[0]` and commit `test: dry-run fault`
    - `gateBrief(task, attemptStart): string`: `MODE: check <attemptStart>`, the test command, and `EXPECT:` followed by `createFiles ∪ testFiles`
    - `isBlockedBy(task, escalatedIds): boolean`: true if `dependsOn` intersects `escalatedIds`
    - `splitScope(findings, allowed: string[]): { inScope: Finding[], outOfScope: Finding[] }`: uses `matchesAllowed` on `finding.file`
    - `unpredicted(predictedFiles, changedFiles): string[]`: changed files the implementer didn't predict (ECC `change-impact`). Logged in the attempt record, advisory only.
  - **Loop per task:**
    - `gate-checker MODE: start` → `checkStart` (dirty → stop the task with the reason) → `implementer` → (dry run only: fault injector) → `gate-checker` with `gateBrief` → `checkDrift` → `nextStep`. A retry passes the previous `attemptStart` so the implementer resets.
    - Then `reviewersFor` in parallel → `dedupeFindings` → `finding-verifier` per finding → `applyVerifierPolicy` → `splitScope`.
    - If anything in scope is confirmed: one `implementer` fix pass (allowed = the files of the confirmed findings plus their tests), then `gate-checker`. Anything still failing → `escalated`.
    - Confirmed out-of-scope findings are returned in `outOfScope[]` and are not fixed here (§8.1a).
  - **After the last task:**
    1. Run `workflow('qa', …)` inline. `gate-checker` supplies `changedFiles` and `diff` from `git merge-base main HEAD`.
    2. `test-automator` lands QA's proposals, with one commit per layer.
    3. Each newly landed test that **fails** goes to `finding-verifier`. If it matches the PRD or design, it becomes a product finding; if not, the test is dropped and the reason is logged.
    4. Confirmed in-scope QA findings get one `implementer` fix pass, then `gate-checker`. Anything still failing escalates.
  - `dryRun.faults[i]` applies to attempt `i+1` of the **first** task only.
  - The result also carries `outOfScope: Finding[]`.
- **`/build <plan path> [task ids] [--dry-run drift,tests]`** (command): the explicit Workflow opt-in.
  - Runs `node .claude/hooks/bin/plan-tasks.mjs`.
  - `--dry-run` becomes `args.dryRun.faults`.
  - Once `bug-reporter` exists (W3-3), files one bug ticket per `outOfScope` finding. Until then, lists them in the ledger.
  - Calls Workflow with `name: 'feature-build'` and the args.
  - Writes `docs/agent-runs/<YYYY-MM-DD>-<slug>.md` from the result: agents, attempts and reasons, gates, confirmed/refuted findings, stats. The main session writes it until `journal-writer` exists.
  - Renders any escalation as a table with the three §8.3 options.
- **`/qa <scope>`:** computes `changedFiles` and `diff` with git, then calls Workflow `name: 'qa'`.

- [ ] **Step 1: Spike (≤ 20 min).**
  - Save `.claude/workflows/ping.workflow.js`. It contains the contracts block plus one `agent('reply OK', { agentType: 'gate-checker', schema: … })`.
  - In a **fresh** session, the owner asks: "run the ping workflow".
  - Confirm that `ping` is discovered by name, and that `agentType: 'gate-checker'` resolves.
  - If discovery needs `<name>.js`, apply the Global Constraints rename. Delete `ping` afterwards.
- [ ] **Step 2: Write the failing tests** (they load the blocks with `loadBlocks`):
  - `qa.test.mjs`:
    - `selectTesters(['packages/engine/src/a.ts'])` → `['functional-tester','edge-case-hunter','security-reviewer']`
    - `selectTesters(['supabase/x.sql','apps/mobile/a.tsx'])` → all six, in order
    - `splitDeviceBound` puts `ui-tester` in `serial`
    - `summarizeQa` with one `null` → listed in `failedTesters`
  - `feature-build.test.mjs`:
    - `classifySize` on the Plan 4a Task 2 object → `small`
    - `reviewersFor(small)` → `['code-reviewer','consistency-reviewer']`
    - `implementerBrief(…, 'abc', {reasons:['drift: x']}, null)` starts with `RESET TO abc`
    - `implementerBrief` never contains `dry-run`
    - `faultBrief('tests', task)` names `packages/engine/src/format.test.ts`
    - `gateBrief` lists `packages/engine/src/format.ts` and `packages/engine/src/format.test.ts` after `EXPECT:`
    - `isBlockedBy({dependsOn:['1']}, ['1'])` → `true`
    - `splitScope([{file:'packages/engine/src/utilization.ts'}], ['packages/engine/src/format.ts'])` → one `outOfScope`
    - `unpredicted(['a.ts'], ['a.ts','b.ts'])` → `['b.ts']`
- [ ] **Step 3:** Run `pnpm --filter @credit-coach/hooks test`. Expected: FAIL.
- [ ] **Step 4: Implement** the workflows (paste the contracts block byte for byte) and the commands. Base the `qa` dedupe, verify and fail-closed shape on ECC `orch-review.workflow.js`, and add the attribution line.
- [ ] **Step 5:** Run `pnpm --filter @credit-coach/hooks test`. Expected: PASS, including `workflows-sync`.
- [ ] **Step 6: Commit** `feat(ai): add feature-build and qa workflows with /build and /qa`.

### Task W2-2: Dry run on Plan 4a Task 2 (§11.3)

**Files:**

- Create (by the workflow): Plan 4a Task 2's files
- Create:
  - `docs/agent-runs/2026-10-22-dry-run-plan-4a-task-2.md`
  - `docs/journal/001-agentic-system-dry-run.md`
- Modify (fixes only): the W2-1 files
- Modify: `docs/status.md`

- [ ] **Step 1: Set up.** Create the worktree `../cc-plan4a-t2` on branch `feat/plan4a-t2-formatters`, then `pnpm install`, then open a **fresh** `claude` session there.
- [ ] **Step 2: Run** `/build docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md 2 --dry-run drift,tests`. Expected result:
  - task `2`: `done`, with 3 attempts
    - attempt 1: `ok:false`, reasons include `drift: packages/engine/src/utilization.ts`
    - attempt 2: `ok:false`, reasons include `tests-failed` (the injected `dry-run fault` test)
    - attempt 3: `ok:true`
  - `utilization.ts` unchanged on the branch: `git diff main -- packages/engine/src/utilization.ts` is empty
  - no injected fault survives: `rg -n "dry-run" packages/engine` finds nothing
  - QA ran `functional-tester`, `edge-case-hunter` and `security-reviewer`
  - `stats` recorded
- [ ] **Step 3: Fix the loop.** Fix whatever the run revealed in the W2-1 files, test-first in `tests/workflows/*`. Re-run with no faults if a fix touched the loop.
- [ ] **Step 4: Write the ledger and journal.**
  - The ledger comes from the run result.
  - Journal 001 uses the `process-journal` skill. It covers what the drift guard caught, what QA found (confirmed vs refuted), and the fixes.
- [ ] **Step 5:** Run `pnpm verify`. Expected: exit 0, and engine coverage ≥ 90% with `format.ts` included.
- [ ] **Step 6: Merge** to `main` (bootstrap rules). Update `docs/status.md`: Plan 4a Task 2 is done, and Wave 3 is next.
- [ ] **Step 7: Commit** `docs: record agentic system dry run on plan 4a task 2`. The formatter commits come from the run.

---

## Wave 3: Remaining agents (4 parallel tickets)

Same shared verification as Wave 1.

### Task W3-1: Analyze agents

**Files:**

- Create: `.claude/agents/requirements-analyst.md`, `.claude/agents/domain-checker.md`, `.claude/agents/design-checker.md`

**Interfaces:**

- Produces:
  - **`criteria[]`** = `{ id: 'AC-<n>', given, when, then }`, plus `invariants[]` (ECC `spec-miner` format only).
  - **`domain-checker`** findings carry `category: 'domain'` and cite F1–F7 or a planner step from the `credit-domain` skill.
  - **`design-checker`** returns `kitComponents[]` (component names from Plan 4a) and accessibility findings (ECC a11y sources, with attribution).

- [ ] **Step 1:** Write the agents.
- [ ] **Step 2: Shared verification.**
- [ ] **Step 3: Commit** `feat(ai): add requirements-analyst, domain-checker and design-checker`.

### Task W3-2: API, UI and integration testers

**Files:**

- Create: `.claude/agents/api-tester.md`, `.claude/agents/ui-tester.md`, `.claude/agents/integration-tester.md`

**Interfaces:**

- **`api-tester`:**
  - local Supabase only (§8.7); keys from `supabase status`
  - proposals target `supabase/tests/**`
  - includes the user A / user B / anonymous RLS isolation trio
- **`ui-tester`:**
  - Maestro flows; screenshots in `docs/test-reports/screens/<date>/`
  - checks touch ≥ 48, ranges on one line, colour never the only signal, reduce-motion
  - **device-bound**
- **`integration-tester`:** demo path within 60 s; admin rule change reaches the app. **Device-bound.**

- [ ] **Step 1:** Write the agents.
- [ ] **Step 2: Shared verification.**
- [ ] **Step 3: Commit** `feat(ai): add api, ui and integration testers`.

### Task W3-3: Bug agents and the bug template (§8.1a)

**Files:**

- Create:
  - `.claude/agents/bug-analyst.md`, `.claude/agents/bug-reporter.md`
  - `.github/ISSUE_TEMPLATE/bug.yml`
  - `docs/test-reports/bugs/README.md`
- Test: `.claude/hooks/tests/bug-template.test.mjs`

**Interfaces:**

- **`bug.yml` field ids:**
  - `summary`, `severity` (dropdown `critical|high|medium|low`), `found-by`, `commit`, `environment`
  - `steps`, `expected`, `actual`, `evidence`, `suspected-area`
  - `rca`, `fix-approach`, `regression-test`, `verification`
  - default labels `bug`
- **`bug-reporter`:**
  - dedupes with `gh issue list --label bug --search`
  - commits evidence under `docs/test-reports/bugs/<issue#>/` and links it by GitHub blob URL
  - labels: `bug`, `severity:*`, `area:*`, `found-by:<agent>`
- **`bug-analyst`:**
  - uses superpowers `systematic-debugging`
  - if it can't reproduce: label `cannot-reproduce`, record what was tried, and stop
  - never edits product code

- [ ] **Step 1: Write the failing test.** `bug.yml` parses with `yaml`, and has exactly the field ids above, each with `validations.required` true except `rca`, `fix-approach`, `regression-test` and `verification`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Write the template, the agents and the README.
- [ ] **Step 4:** Run `pnpm --filter @credit-coach/hooks test`. Expected: PASS. Run the shared verification too.
- [ ] **Step 5: Commit** `feat(ai): add bug-analyst, bug-reporter and bug template`.

### Task W3-4: PR review and ops agents

**Files:**

- Create: `.claude/agents/pr-reviewer.md`, `.claude/agents/pr-test-analyzer.md`, `.claude/agents/pm-sync.md`, `.claude/agents/journal-writer.md`

**Interfaces:**

- **`pr-reviewer`:**
  - Posts **one `COMMENT` review** with inline comments for confirmed findings. GitHub rejects approve or request-changes reviews on your own PR, because the author and reviewer share the ShubhamU55 token.
  - Posts the **G8 commit status** `gh api repos/ShubhamU55/credit-coach/statuses/<head sha> -f context=pr-review -f state=<success|failure> -f description=<≤140 chars>`.
  - `verdict: 'approve'|'request-changes'` maps to `success|failure`.
- **`pm-sync`:**
  - card fields `owner`, `scope`, `merge_gate`, `handoff` (ECC `team-agent-orchestration`)
  - moves items between Backlog, Ready, In progress, Review, Done and Blocked
  - comments gate evidence
  - honours the `session:<worktree>` claim label
- **`journal-writer`:**
  - writes the run ledger at `docs/agent-runs/<YYYY-MM-DD>-<slug>.md`
  - writes journal entries per the `process-journal` skill
  - escalations use the ECC checkpoint headings: Worked / Didn't / Exact next step
  - **janitor role:** proposes deletions only

- [ ] **Step 1:** Write the agents. `pr-test-analyzer` is adapted from ECC. ECC's `comment-analyzer`, `type-design-analyzer` and `code-simplifier` are **not** adopted: no §8.9 lens needs them (YAGNI).
- [ ] **Step 2: Shared verification.**
- [ ] **Step 3: Commit** `feat(ai): add pr-reviewer, pr-test-analyzer, pm-sync and journal-writer`.

---

## Wave 4: Remaining workflows, commands and judge docs (5 parallel tickets)

Each workflow ticket pastes the contracts block verbatim, keeps its decision logic in `// <pure>`, and tests it in `.claude/hooks/tests/workflows/<name>.test.mjs`. The test command for all of them is `pnpm --filter @credit-coach/hooks test` (expected: FAIL before, PASS after).

### Task W4-1: `feature-analyze` and the new `/feature`

**Files:**

- Create: `.claude/workflows/feature-analyze.workflow.js`
- Modify: `.claude/commands/feature.md`
- Test: `.claude/hooks/tests/workflows/feature-analyze.test.mjs`

**Interfaces:**

- args: `{ prdSection: string, isUi: boolean }`
- Returns `{ criteria, invariants, risks: Finding[], kitComponents: string[], openQuestions: string[], outOfScope: string[], failedAgents: string[] }`.
- `pure`: `mergeAnalysis(results): AnalysisBrief`. It dedupes `openQuestions` by normalized text. A `null` `requirements-analyst` result makes the whole brief `failed`, because the criteria are mandatory.
- **`/feature <PRD §>`:**
  1. run `feature-analyze`
  2. the main session writes the plan with superpowers `writing-plans`
  3. optional `planner` second opinion
  4. **stop for owner approval**
  5. on approval, `pm-sync` files one issue per task
  6. tell the owner to run `/build`

- [ ] **Step 1: Write the failing test.** `mergeAnalysis` with `null` analyst → `status: 'failed'`. Duplicate questions differing only in case → one.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(ai): add feature-analyze workflow and rewire /feature`.

### Task W4-2: `pr-review` workflow, `/pr-review`, end-of-plan dual review

**Files:**

- Create: `.claude/workflows/pr-review.workflow.js`, `.claude/commands/pr-review.md`
- Test: `.claude/hooks/tests/workflows/pr-review.test.mjs`

**Interfaces:**

- args: `{ pr: number, headSha: string, diff: string, changedFiles: string[], specPaths: string[], round: number, previousFindings?: Finding[], mode?: 'pr' | 'end-of-plan' }`
- **Lenses** (§8.9), each an `agentType`:
  - spec → `code-reviewer` with a spec brief
  - correctness → `typescript-reviewer`
  - security → `security-reviewer`
  - consistency → `consistency-reviewer`
  - test-adequacy → `pr-test-analyzer`
  - silent-failure → `silent-failure-hunter`
  - ui → `react-reviewer` + `design-checker`, only if `apps/mobile/**` changed
- `pure` block:
  - `lensesFor(changedFiles, mode): Lens[]`
  - `prVerdict(confirmed: Finding[], failedLenses: string[], round: number): { verdict: 'approve'|'request-changes', escalate: boolean }`:
    - any blocking confirmed finding, or any failed lens → `request-changes` (fail closed)
    - `escalate` when `request-changes` and `round >= 2`
- **`mode: 'end-of-plan'`** (ECC `santa-method`, with no external model and no `git push`):
  - two independent `code-reviewer` runs on `model: 'opus'` against the plan's Review Focus rubric
  - both must PASS
  - at most 2 rounds
- The workflow ends with `pr-reviewer`, which posts the COMMENT review and the `pr-review` status.

- [ ] **Step 1: Write the failing test.**
  - `prVerdict([], ['security'], 1)` → `request-changes`
  - one confirmed `high` at round 2 → `escalate: true`
  - `lensesFor(['packages/engine/a.ts'], 'pr')` has no `ui` lens
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(ai): add pr-review workflow with G8 status and dual review`.

### Task W4-3: `bugfix` workflow, `/bugfix` and `/bug`

**Files:**

- Create: `.claude/workflows/bugfix.workflow.js`, `.claude/commands/bugfix.md`, `.claude/commands/bug.md`
- Test: `.claude/hooks/tests/workflows/bugfix.test.mjs`

**Interfaces:**

- args: `{ issue: number | null, description?: string }`
- Phases: `bug-reporter` (if `issue` is null) → `bug-analyst` → `test-automator` lands the RED test → `implementer` within `fixFiles` → `gate-checker` → `checkDrift` / `nextStep` → returns `{ status, issue, prBody }`.
- `/bugfix` then opens the PR with `Fixes #N` and runs `/pr-review`.
- **After the merge,** `/bugfix <issue#> --close` runs two steps (§8.1a step 5):
  - `bug-reporter` re-runs the original failing flow or test on `main` and attaches the passing evidence.
  - `pm-sync` moves the item to Done, links the PR and closes the issue.

  If the re-run fails, the issue stays open with the new evidence.

- `pure` block:
  - `canFix(analysis): { ok: boolean, reason }`:
    - false unless `reproduced === true`
    - `fixFiles` must be non-empty
    - `regressionTest.file` must be set
  - `fixTask(analysis): Task`: `files = fixFiles`, `testFiles = [regressionTest.file]`, `testCommand` taken from the analysis

- [ ] **Step 1: Write the failing test.** `canFix({reproduced:false})` → `ok:false, reason:'cannot-reproduce'`. `fixTask` maps the fields.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(ai): add bugfix workflow with /bugfix and /bug`.

### Task W4-4: `retro`, `/retro`, `/tidy`, `/worktrees` (cut first if late)

**Files:**

- Create:
  - `.claude/workflows/retro.workflow.js`
  - `.claude/commands/retro.md`, `.claude/commands/tidy.md`, `.claude/commands/worktrees.md`
  - `.claude/hooks/lib/tidy.mjs`, `.claude/hooks/bin/tidy.mjs`
  - `.claude/hooks/bin/worktrees.cjs` (ECC `scripts/worktree-lifecycle.js` plus its lib, adapted)
- Test: `.claude/hooks/tests/workflows/retro.test.mjs`, `.claude/hooks/lib/tidy.test.mjs`

**Interfaces:**

- **`retro`:**
  - args `{ ledgers: string[] }` (ledger texts, read by the command)
  - `pure` `agentStats(ledgers): Record<agent, { runs, retries, escalations, falsePositiveRate }>`
  - proposes prompt edits with ECC `learn-eval` verdicts (`Save | Improve | Absorb | Drop`) for owner approval
- **`tidy.mjs`:**
  - `listExpiredScratch(files: Array<{ path, text }>, todayIso): string[]`
  - `findStaleRefs(docs: Array<{ path, text }>, exists: (p) => boolean): Array<{ doc, ref }>`, which checks backticked repo paths
- **`/worktrees`:** stale worktrees, plus predicted conflicts via `git merge-tree --write-tree` between active ticket branches.

- [ ] **Step 1: Write the failing tests.**
  - `agentStats` on two fixture ledgers gives the expected counts
  - `listExpiredScratch` flags only expired items
  - `findStaleRefs` flags a missing path
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Pass.**
- [ ] **Step 4: Commit** `feat(ai): add retro, tidy and worktrees tooling`.

### Task W4-5: Docs for judges

**Files:**

- Create: `docs/ai-system.md`, `docs/adr/0003-agentic-delivery-system.md`, `docs/journal/002-agentic-system.md`
- Modify: `CLAUDE.md`, `README.md`, `docs/status.md`

**Interfaces:**

- Consumes: the command and workflow names from W2-1 and W4-1…4.

- [ ] **Step 1: Write `docs/ai-system.md`** (≤ 1 page plus one Mermaid diagram). It covers:
  - the commands → workflows → agents → gates flow
  - the drift guard, the retry/escalation policy and the verifier policy
  - the token policy with its model-tier table (cite ECC's longform guide)
  - where the evidence lives
- [ ] **Step 2: ADR 0003** records the Workflow-as-coordinator decision, the contracts-copy design and the G8-as-status decision.
- [ ] **Step 3: Update `CLAUDE.md`.**
  - The Workflow section becomes `/feature` → `/build` → `/qa` → `/pr-review`, plus `/bugfix`, `/retro` and `/tidy`.
  - The ownership table reflects the roster.
  - Keep it ≤ 120 lines.
- [ ] **Step 4: Update `README.md`.** Add the CI badge and the Sonar badge (its URL uses the W0-5 project key), plus a link to `docs/ai-system.md`.
- [ ] **Step 5: Write journal 002** (`process-journal`).
- [ ] **Step 6: Run the checks.** Run `pnpm verify` and `rg -n "tdd-guide" CLAUDE.md docs/ai-system.md`. Expected: exit 0, and no matches.
- [ ] **Step 7: Commit** `docs: explain the agentic system for judges`.

---

## Wave 5: Owner-gated

### Task W5-1: Push, Sonar and branch protection (needs owner actions 1–2)

**Files:**

- Modify: `sonar-project.properties` (organization key, if it differs)
- Create: `docs/agent-runs/2026-10-23-branch-protection.md` (commands run and their output)

- [ ] **Step 1: Push.** Push `main` with the ShubhamU55 token (`docs/status.md` has the snippet), then run `GH_TOKEN=… gh run watch`. Expected: every job green, or `skipped` for path-gated ones. Sonar shows a passed quality gate.
- [ ] **Step 2: Repo settings.**
  - `gh api -X PATCH repos/ShubhamU55/credit-coach -F allow_auto_merge=true -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true`
- [ ] **Step 3: Read the real check names.** Run `GH_TOKEN=… gh api repos/ShubhamU55/credit-coach/commits/<green sha>/check-runs --jq '.check_runs[].name'`.
  - Map each gate to the name GitHub actually reports. Expect `CodeQL` (code scanning) in addition to the `codeql` job, and the OSV reusable workflow's own name.
  - In the repo's code scanning settings, set the CodeQL failure threshold to **high**. Without it, G6 only checks that the analysis ran, not that it found nothing.
- [ ] **Step 4: Branch protection.**
  - `gh api -X PUT repos/ShubhamU55/credit-coach/branches/main/protection` with:
    - `required_status_checks.strict=false`. Squash merges keep history linear, and `strict=true` would stall parallel auto-merges: each merge makes the other PRs out of date, and updating a branch changes its SHA, which drops its `pr-review` status.
    - contexts: the names from Step 3 for G1, G2, G4, G5, G6, G7 and G9, plus `hold-check` and `pr-review`
    - `required_pull_request_reviews=null` (G8 is a status, not a review)
    - `required_linear_history=true`, `allow_force_pushes=false`
    - `enforce_admins=true`. The single account is an admin, and agents push with its token, so without this every agent can bypass the gates. The owner's override is to toggle it off temporarily and record that in the ledger.
  - Record the commands and their output in the ledger.
  - **G3 (`api`) is added in Plan 3**, when its job exists.
- [ ] **Step 5: Prove the protection works.**
  - Run `git push origin HEAD:main` from a scratch commit. Expected: rejected by protection.
  - Open a throwaway PR that adds `scratch/probe.md` (with a header) and label it `hold`.
  - Expected: `hold-check` fails and auto-merge waits.
  - Remove the label. Run `/pr-review <PR#>`. Expected: the `pr-review` status is posted, then the PR auto-merges after `gh pr merge --auto --squash`.
  - Delete the probe in a follow-up commit.
- [ ] **Step 6: Commit** `chore(ci): record branch protection and merge gates`. Commit it on a branch and merge it through a PR: `main` is protected now.

### Task W5-2: Projects board (needs owner action 1)

**Files:**

- Create: `scripts/pm/bootstrap-board.sh` (idempotent: it checks before creating)
- Modify: `README.md` (board link), `docs/status.md`

**Interfaces:**

- **Board** "Credit Coach" on ShubhamU55:
  - Status columns: `Backlog, Ready, In progress, Review, Done, Blocked`
  - Fields: `Plan`, `Task #`, `Wave` (number), `Agent`, `Attempts` (number), `Est. vs actual`
- **Milestones:** Foundation, Agentic system, Engine, Backend, UI kit, Screens, Admin, Submission.
- **Labels:** `area:*`, `agent:*`, `bug`, `severity:*`, `found-by:*`, `blocked`, `escalated`, `hold`, `cannot-reproduce`, `triaged`, `session:*`.

- [ ] **Step 1: Write the script** using `gh project create|field-create`, `gh api` for milestones and `gh label create --force`.
- [ ] **Step 2: Run it.** Run it twice. Expected: the second run creates nothing.
- [ ] **Step 3: Backfill.** `pm-sync` files one **closed** issue per Plan 1c ticket (milestone "Agentic system", `Wave` set), linking the merge commit.
- [ ] **Step 4: Update `README.md`** with the board link, and **`docs/status.md`**: Plan 1c done.
- [ ] **Step 5: Commit** `chore(pm): bootstrap the Credit Coach board`.
