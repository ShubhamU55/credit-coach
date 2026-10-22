# Security checklist

Derived from `docs/security/threat-model.md` and PRD/CLAUDE.md product rules (spec §8.10). One checkbox per rule. Each names the plan whose test enforces it; "today" means it is already enforced in this repo, not deferred to a future plan. `.claude/agents/security-reviewer.md` checks this list on every security-triggering change and before submission.

## PAN, consent and demo

- [ ] PAN is never stored in full (hash + last 4 only). **Enforced by: Plan 3** (Supabase schema/migration test).
- [ ] PAN is never logged in full, anywhere (app, admin, Edge Function logs). **Enforced by: Plan 3** (a test greps log statements for PAN patterns).
- [ ] PAN is masked everywhere in the UI (`ABXXXXX34F`). **Enforced by: Plan 4b** (mobile screen test/E2E).
- [ ] Consent to fetch a credit report is recorded with a timestamp. **Enforced by: Plan 3** (schema) and **Plan 4b** (consent screen records it).
- [ ] The demo path ("Try sample profile", on-screen OTP) never touches a real bureau or sends a real SMS. **Enforced by: Plan 4b** (demo-path E2E, Maestro).

## RLS and data access (database-reviewer-derived)

- [ ] RLS is enabled on **every** table, deny-by-default. **Enforced by: Plan 3** (the RLS-on-every-table test, per §8.10).
- [ ] RLS policies use the `(SELECT auth.uid())` pattern, not a per-row function call. **Enforced by: Plan 3** (`database-reviewer` checklist, adapted from ECC's `agents/database-reviewer.md`).
- [ ] RLS policy columns are indexed. **Enforced by: Plan 3** (`database-reviewer` checklist).
- [ ] No `GRANT ALL` to application users; public schema permissions revoked. **Enforced by: Plan 3** (`database-reviewer` checklist).
- [ ] Foreign keys are indexed. **Enforced by: Plan 3** (`database-reviewer` checklist).

## Secrets

- [ ] Only the Supabase **anon** key ships in any client bundle (mobile or admin); the **service role** key lives only in Edge Function secrets. **Enforced by: Plan 3** (Edge Function review) and today's CI gate G4 (gitleaks secret scan on every PR).
- [ ] The Anthropic API key lives only in Supabase Edge Function secrets, never in the repo or a client bundle. **Partially enforced today**: the `protect-env` hook blocks agent writes to `.env*` and `config-protection.cjs` blocks agent writes to `.claude/settings.json`'s deny-list — but both only match the `Write|Edit|MultiEdit` tools, not a Bash-tool edit (`sed -i`, `cat > file`, a shell redirect). `.claude/settings.json` separately denies reads of `.env*` and SSH/AWS credential paths; CI gate G4 (gitleaks) is the backstop that does cover the Bash-tool path.
- [ ] `.claude/**` carries no hidden Unicode (zero-width/bidi/BOM) or hidden `<!--` instructions that could steer an agent into leaking a secret. **Enforced today**: `.claude/hooks/tests/config-audit.test.mjs`.
- [ ] Agents cannot bypass git hooks (`--no-verify`, `core.hooksPath` redirection) to skip the checks above. **Enforced today**: `block-no-verify.cjs` (this task, W1-4) is a `Bash`-matched PreToolUse hook — it inspects the command Claude is about to run and blocks it before it executes. **Not enforced by an actual git hook**: no `commit-msg`/`pre-commit` git hook is installed in `.git/hooks`, and `core.hooksPath` is untouched; this is policy enforced at the tool-call layer, not at the git layer, so it only covers commands run through this harness's Bash tool.
- [ ] Agents cannot weaken a lint/format config, `.claude/settings.json`, `.claude/settings.local.json`, or this repo's own guard-hook scripts, to make a check pass instead of fixing the problem. **Partially enforced today**: `config-protection.cjs` (this task, W1-4; extended in fix round 1) blocks `Write|Edit|MultiEdit` on exactly: known lint/format config basenames and patterns (ESLint/Prettier/Stylelint/Biome/Ruff/markdownlint); `.claude/settings.json` and `.claude/settings.local.json` (the latter blocked unconditionally, including first-time creation); and five named guard scripts — `block-no-verify.cjs`, `pre-bash-commit-quality.cjs`, `config-protection.cjs`, `protect-env.mjs`, `lib/shell-scan.cjs`. **Nothing more**: `.claude/hooks/lib/contracts.mjs` and the rest of `.claude/hooks/**` stay editable (W2–W4 need to edit them), and a Bash-tool edit (e.g. `sed -i` on any of the above) is not caught by this hook at all — CI gate G1 (lint) and a human/`pr-reviewer` diff review are the backstop for that path.

## Commit message integrity

- [ ] A commit message that fails our conventional-commit format, carries `Co-Authored-By`/"Generated with" attribution (including via `--trailer`), uses `--amend`, reads its message from an unreadable source (`-F`/`--file`/`-t`/`--template`, an unquoted heredoc delimiter, a bare `$(...)`), or has no message flag at all, is BLOCKED (exit 2), not warned. **Enforced today**: `pre-bash-commit-quality.cjs` (PreToolUse, `Bash` matcher). Fix round 1 replaced a substring check (`command.includes('git commit')`) with real parsing via the vendored shell scanner (`lib/shell-scan.cjs`), so `git -c k=v commit`, a double-spaced `git  commit`, a command chained with `&&`, or an environment-variable prefix no longer bypass it, and a non-git command that merely quotes "git commit" (e.g. a `grep`) no longer false-triggers it. **Not yet enforced elsewhere**: there is no git-layer `commit-msg` hook (same caveat as the row above); the gate-checker drift guard's `checkCommitMessage` (`.claude/hooks/lib/contracts.mjs`) checks the same rule but only exists from **Plan 1c Wave 2 (W2-1)** onward, and only for commits made through a `/build`-style workflow task — not every commit a human or an ad hoc agent session makes. A CI-side lint of PR commit messages (independent of this hook) is **planned for W5-1**, not present today.

## Mobile (MASVS / OWASP Mobile Top 10)

- [ ] Session tokens use `expo-secure-store`, never plain `AsyncStorage`. **Enforced by: Plan 4b**.
- [ ] No HTTP (plaintext) network calls; only HTTPS to Supabase/Edge Functions. **Enforced by: Plan 4b**.
- [ ] No debug logs in release builds. **Enforced by: Plan 4b** (release build check, per §8.10).
- [ ] The release APK has no hardcoded secrets or debug backdoors (MASTG-STORAGE / MASTG-CODE checks). **Enforced by: Plan 4b**.

## LLM Edge Function

- [ ] The function treats all input as untrusted; it never executes or reflects instructions found in that input as if they were from the owner. **Enforced by: Plan 3** (Edge Function tests; `wrapUntrusted` pattern from `contracts.mjs` is the model for fencing).
- [ ] The function only words numbers the rules engine already computed; it never computes or invents an amount, date or score (CLAUDE.md non-negotiable 2). **Enforced by: Plan 3**.
- [ ] A template fallback exists so the app works if the LLM call fails. **Enforced by: Plan 3**.
- [ ] The function has a timeout and rate limiting. **Enforced by: Plan 3**.
- [ ] A predicted score is never shown exact; always a 300–900-clamped range plus reasons, labelled as an estimate. **Enforced by: Plan 2** (predictor engine test) and **Plan 4b** (UI copy).

## Admin

- [ ] Admin routes/RPCs require an admin-role claim, checked server-side (never only hidden in the client UI). **Enforced by: Plan 5**.
- [ ] Rule changes and sample-profile edits are recorded in the audit log (who/when). **Enforced by: Plan 5**.

## Dependencies and static analysis

- [ ] `pnpm audit --audit-level=high` / OSV-Scanner runs on every PR. **Enforced today**: CI gate G5.
- [ ] CodeQL runs on every PR. **Enforced today**: CI gate G6 (`.github/workflows/codeql.yml`).
- [ ] SonarQube security hotspots are reviewed on every PR (when `SONAR_TOKEN` is configured). **Enforced today**: CI gate G7.

## Agent-config security and the G8 trust gap

- [ ] A `pr-review` commit status can only be posted by the `pr-reviewer` workflow, not forged by prompt injection from an untrusted diff. **Partially enforced today** (`wrapUntrusted` neutralizes forged BEGIN/END fence markers in `contracts.mjs`); the residual risk is the G8 trust gap below, which has no automated test.
- [ ] **G8 trust gap is documented and owner-accepted** (see `docs/security/threat-model.md`): anyone holding the `ShubhamU55` token can post a passing `pr-review` status directly. Mitigated by the owner's `hold` label and the pre-submission security pass, not by a test.

## Before submission

- [ ] A full security pass by `security-reviewer` on Opus over the whole repo, with findings and fixes recorded in `docs/security/review-YYYY-MM-DD.md` (§8.10). **Process step, not a test** — scheduled before the 30 Oct 2026 deadline.
