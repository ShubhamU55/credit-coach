# AI-Workflow Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the hackathon-critical gaps from the 29 Oct 2026 AI-workflow audit of `origin/main` (ecf9df3), so the repo's claims about its AI process match what GitHub and the files show.

**Architecture:** Agent tasks (1–4) change docs, nested instruction files, CODEOWNERS and add one new CI check (PR-body disclosure), each pinned by a Vitest test in `.claude/hooks/tests/` or `.claude/hooks/lib/`, which `pnpm verify` and CI already run. Owner tasks (O1–O4) touch files the `config-protection` hook blocks for agents (`.claude/settings.json`, guard scripts) or GitHub settings; the plan gives their exact content, but no agent performs them.

**Tech Stack:** Node ≥ 20 ESM, Vitest (`@credit-coach/hooks` workspace), GitHub Actions, Markdown.

**Spec:** The audit result in this session (scorecard + "Security actions required" + "Changes required"). Findings addressed: G8 status not evidenced, AI-assisted PR section unused, ai-policy merge-commit contradiction, nested `AGENTS.md` not auto-loaded, stale `ai-system.md` "Honest limits", no session-hygiene/cost guidance, `.env` readable via shell, `eslint.shared.cjs` unprotected, branch protection without required PR.

## Global Constraints

- Conventional commits; **no** `Co-Authored-By` / "Generated with" lines (CLAUDE.md non-negotiable 7; the commit hook blocks them).
- Agents never edit `.claude/settings.json`, `.claude/hooks/{block-no-verify.cjs,pre-bash-commit-quality.cjs,config-protection.cjs,protect-env.mjs,lib/shell-scan.cjs}`, existing `.github/workflows/*.yml`, `.env*`, `docs/design.md` or `.design/`.
- No new dependencies (ai-policy "Dependencies" row).
- Dates in docs: "29 Oct 2026". State only facts traceable to a file, ledger or `gh` output; no invented claims.
- Run `pnpm --filter @credit-coach/hooks test` after each task, and `pnpm verify` before each commit.

## Review Focus

1. A PR body written in GitHub's web editor uses `\r\n` line endings: `checkPrBody` must parse it the same as `\n` (Task 4 test `handles CRLF bodies`).
2. A PR opened with an empty body arrives as `null`/empty: the check must fail with a readable message, not throw (Task 4 test `fails an empty body`).
3. The template placeholder left in place (`<for example /build, ...>`) must fail; the literal answer `none` must pass (Task 4 tests).
4. Section content that is only an HTML comment counts as empty (Task 4 test `treats comment-only sections as empty`).
5. The PR body is attacker-controlled text: the workflow passes it through an `env:` variable, never `${{ github.event.pull_request.body }}` inside `run:` (Task 4 test `workflow does not interpolate the body into run`).

---

### Task 1: Load the nested AGENTS.md files in Claude Code

Claude Code reads `CLAUDE.md`, not `AGENTS.md`, so the Expo SDK 58 / Next 16 warnings never load.

**Files:**

- Create: `apps/mobile/CLAUDE.md`, `apps/admin/CLAUDE.md`
- Create: `.claude/hooks/tests/nested-instructions.test.mjs`
- Modify: `.github/CODEOWNERS` (add `/apps/*/CLAUDE.md @ShubhamU55` after the `/apps/*/AGENTS.md` line)
- Modify: `.claude/hooks/tests/review-path.test.mjs` (`REQUIRED_OWNED_PATHS`: add `'/apps/*/CLAUDE.md'` in the same position)

**Interfaces:** none consumed or produced.

- [ ] **Step 1: Write the failing test** `nested-instructions.test.mjs`, same `repoRoot` idiom as `ai-policy.test.mjs`:
  - `it('gives every apps/*/AGENTS.md a sibling CLAUDE.md that imports it')`: for each dir in `apps/` containing `AGENTS.md`, expect `apps/<dir>/CLAUDE.md` to exist and to contain a line exactly `@AGENTS.md`.
  - `it('keeps the nested CLAUDE.md files short pointers')`: each nested `CLAUDE.md` is ≤ 10 lines.
- [ ] **Step 2: Run** `pnpm --filter @credit-coach/hooks test nested-instructions` → FAIL (file missing).
- [ ] **Step 3: Create both `CLAUDE.md` files**: one line `@AGENTS.md`, optionally a one-line comment above it saying the import exists because Claude Code does not read `AGENTS.md`. Update CODEOWNERS and `REQUIRED_OWNED_PATHS`.
- [ ] **Step 4: Run** `pnpm --filter @credit-coach/hooks test` → PASS (including `review-path`).
- [ ] **Step 5: Commit** `chore: import nested AGENTS.md files through CLAUDE.md`

### Task 2: Make docs/ai-policy.md match the repo's real merge settings and history

Branch protection requires linear history (no merge commits), and every PR since #1 was squash-merged, but the policy says "merge commit, not a squash". Also disclose that commits before 28 Oct 2026 went to `main` directly, before protection existed.

**Files:**

- Modify: `docs/ai-policy.md` (`## Review` section only; keep every heading, `ai-policy.test.mjs` pins them)
- Modify: `.claude/hooks/tests/ai-policy.test.mjs`

- [ ] **Step 1: Add failing tests** to `ai-policy.test.mjs`:
  - `it('describes squash merges, matching required linear history')`: expect the text not to match `/merge commit, not a squash/i`, and to match `/squash/i`.
  - `it('discloses the direct-to-main history before branch protection')`: expect it to match `/before branch protection/i`, and to contain `28 Oct 2026`.
  - `it('sets a PR size guideline')`: expect it to match `/400 changed lines/`.
- [ ] **Step 2: Run** `pnpm --filter @credit-coach/hooks test ai-policy` → 3 FAIL.
- [ ] **Step 3: Edit `## Review`**:
  - Replace the merge-commit sentence: PRs are squash-merged, `main` requires linear history, and each first-parent commit carries its `(#N)`.
  - Add one bullet: until branch protection was switched on on 28 Oct 2026, commits (including AI config) went to `main` directly (verify the first protected PR number with `git log --first-parent origin/main`); from then on, every change goes through a PR with the required checks.
  - Add one bullet: aim for PRs of at most about 400 changed lines; split larger work by ticket.
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** `docs: align the AI policy with squash merges and disclose pre-protection history`

### Task 3: Refresh ai-system.md (honest limits, session hygiene and cost) and record the sandbox gap

**Files:**

- Modify: `docs/ai-system.md` (`## Honest limits (as of …)`; add `## Session hygiene and cost` directly after `## Token policy`)
- Modify: `docs/security/checklist.md` (add one known-gap item: native Windows has no Claude Code sandbox and no network limit; this is an accepted risk, and the mitigation is the deny rules plus hooks)
- Modify: `.claude/hooks/tests/docs-currency.test.mjs`

- [ ] **Step 1: Add failing tests** to `docs-currency.test.mjs`:
  - `it('does not describe branch protection as still pending in ai-system.md')`: `docs/ai-system.md` must not match `/Nothing is pushed yet/`, and must contain `Honest limits (as of 29 Oct 2026)`.
  - `it('documents session hygiene and cost in ai-system.md')`: there must be a `## Session hygiene and cost` heading, and the section must mention `/clear`, `/compact` and `/cost`.
  - `it('records the missing sandbox as a known gap')`: `docs/security/checklist.md` must match `/sandbox/i`.
- [ ] **Step 2: Run** the tests → FAIL.
- [ ] **Step 3: Rewrite "Honest limits"**, citing evidence:
  - Branch protection is on, with its required checks. Read the list from `gh api repos/ShubhamU55/credit-coach/branches/main/protection` if available; otherwise copy it from `docs/agent-runs/2026-10-23-branch-protection.md`.
  - Which workflows have now run live: only those with a ledger in `docs/agent-runs/` (PD-1 to PD-4, PD-7). Keep any limit that is still true; drop the ones that no longer are.
- [ ] **Step 4: Write "Session hygiene and cost"** as 5–7 bullets:
  - One ticket per session, with `/clear` between tickets and `/compact` when context is long.
  - Plan first through `/feature` for anything larger than a single task.
  - The `docs/status.md` handoff happens at session end.
  - Record the `/cost` total in that run's ledger under `Cost:`.
  - State that per-run token accounting in the workflows is still not built.
- [ ] **Step 5: Add the sandbox known-gap item** to the checklist.
- [ ] **Step 6: Run** the tests → PASS. **Commit** `docs: refresh AI-system limits, add session hygiene and cost, record sandbox gap`

### Task 4: Require the AI-assisted disclosure in every PR body (new CI check)

Commits carry no AI attribution by policy, so the PR template's `## AI-assisted` section is the only per-change disclosure. PR #60 left it out.

**Files:**

- Create: `.claude/hooks/lib/pr-body.mjs`, `.claude/hooks/lib/pr-body.test.mjs`
- Create: `.claude/hooks/bin/pr-body-check.mjs` (reads `process.env.PR_BODY`, prints the missing items, and exits 1 on failure)
- Create: `.github/workflows/pr-body.yml`
- Test (workflow shape): add to `.claude/hooks/lib/pr-body.test.mjs`

**Interfaces:**

- Produces: `export function checkPrBody(body: string | null | undefined): { ok: boolean; missing: string[] }`. `missing` entries are human-readable, e.g. `"## AI-assisted section"` and `"AI-assisted: agents or commands used"`.

- [ ] **Step 1: Write the failing tests** in `pr-body.test.mjs`:
  - `passes the filled template`: a body with `## Test evidence` containing `pnpm verify`, plus `## AI-assisted` containing `- Agents or commands used: /build, /pr-review` and `- Process journal entry or run ledger: docs/agent-runs/2026-10-28-pd-4.md` → `{ ok: true, missing: [] }`.
  - `accepts "none" as the agents answer`: `- Agents or commands used: none`, and the ledger line `none` → ok.
  - `fails when the AI-assisted section is missing` → `missing` contains `'## AI-assisted section'`.
  - `fails when the placeholder is left` (the value is `<for example /build, /qa, /pr-review, or "none">`) → `missing` contains `'AI-assisted: agents or commands used'`.
  - `fails an empty body`: both `null` and `''` → `ok: false`, with no throw.
  - `handles CRLF bodies`: the passing body with `\n` replaced by `\r\n` → ok.
  - `treats comment-only sections as empty`: `## AI-assisted` containing only `<!-- ... -->` → not ok.
  - `fails when Test evidence has no command output`: `## Test evidence` with only the unchecked template lines (`<result line, …>`) → `missing` contains `'Test evidence: a pnpm verify result line'`.
  - `workflow does not interpolate the body into run`: read `.github/workflows/pr-body.yml`, expect the text not to match `/run:[^\n]*\$\{\{\s*github\.event\.pull_request\.body/`, and to contain `PR_BODY: ${{ github.event.pull_request.body }}` under `env:`.
- [ ] **Step 2: Run** `pnpm --filter @credit-coach/hooks test pr-body` → FAIL.
- [ ] **Step 3: Implement `checkPrBody`**: normalise `\r\n` to `\n`; strip `<!-- … -->`; split on `^## `. A value counts as a placeholder when it is empty or matches `^<.*>$`.
- [ ] **Step 4: Implement `bin/pr-body-check.mjs`**: call `checkPrBody(process.env.PR_BODY)`. On failure, write `pr-body: missing <item>` lines to stderr and exit 1.
- [ ] **Step 5: Create `pr-body.yml`**:
  - Triggers: `on: pull_request: types: [opened, edited, synchronize, reopened]`.
  - Permissions: top-level `permissions: contents: read`.
  - Job: one job, `pr-body`, named `pr-body`.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` (node 20), then `run: node .claude/hooks/bin/pr-body-check.mjs` with `env: PR_BODY: ${{ github.event.pull_request.body }}`.
  - Follow any rule `ci-config.test.mjs` enforces on workflows (read it first).
- [ ] **Step 6: Run** `pnpm --filter @credit-coach/hooks test` → PASS (including `ci-config`). Then run `pnpm verify` → PASS.
- [ ] **Step 7: Commit** `ci: require the AI-assisted disclosure in pull request bodies`

---

## Owner tasks (agents cannot do these: hook-protected files or GitHub settings)

### O1: Deny shell reads of `.env` (`.claude/settings.json`)

Add these to `permissions.deny`:

- `"Bash(cat *.env*)"`, `"Bash(less *.env*)"`, `"Bash(head *.env*)"`, `"Bash(tail *.env*)"`, `"Bash(grep * *.env*)"`
- `"PowerShell(Get-Content *.env*)"`, `"PowerShell(cat *.env*)"`, `"PowerShell(type *.env*)"`

Then run `pnpm --filter @credit-coach/hooks test settings` and update `settings.test.mjs` if it pins the deny list.

### O2: Protect the shared ESLint rules (`.claude/hooks/config-protection.cjs`)

- Add `'eslint.shared.cjs'` to `PROTECTED_FILES`.
- Add a case to the hooks test asserting that an Edit to `eslint.shared.cjs` exits 2.
- Mark the item fixed in `docs/security/checklist.md:27`.

### O3: Branch protection (GitHub)

- Turn on "Require a pull request before merging" (0 approvals, solo) and "Require branches to be up to date".
- Add `pr-body` and `pr-review` to the required checks. Do this only after Task 4's PR has produced a `pr-body` run, or GitHub can't find the check.

### O4: Evidence the G8 gate

Run `/pr-review <PR#>` on this plan's PR, and on any later submission PR. Confirm a `pr-review` commit status appears on the head SHA.
