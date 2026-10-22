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

- [ ] Every commit an agent makes through the Bash tool has a conventional-commit message with no `Co-Authored-By`/"Generated with" attribution (in a message or a `--trailer`, colon or `=` form), is never an `--amend`, and has a message the hook can read literally. Anything else is BLOCKED (exit 2), not warned. **Enforced today**: `pre-bash-commit-quality.cjs` (PreToolUse, `Bash` matcher; tests in `.claude/hooks/tests/commit-hook.test.mjs` and `ecc-hooks.test.mjs`). The hook reads only the command text, in two layers.
  - **Is this a commit?** The vendored scanner (`lib/shell-scan.cjs`) splits the command into simple commands (on `&&`, `||`, `;`, `|`, newlines and subshells, and inside every `$(…)`). Three closed tiers then classify each one:
    - **Tier 1, parsed.** The hook parses `git` (after literal `NAME=value` prefixes and the transparent `env`/`command`/`time`/`builtin`/`!`/`if`/`then`/`do`/… prefixes with their known options). It also parses `bash`/`sh`/`dash`/`zsh`/`ksh` with a literal `-c` script, which it scans again as its own command. The shell option walk treats `-o`/`-O` as taking the next word wherever they sit in a cluster (`-co pipefail`, `-ceo pipefail`). A git invocation whose literal subcommand is not `commit` is not a candidate. A non-literal subcommand word (`co{mmit,}`) is blocked.
    - **Tier 2, opaque string.** Any other command is blocked as unreadable if its own text, or the stdin it is fed (a heredoc, a here-string, or the pipeline feeding it), matches `git … commit`. That covers `eval`, any spelling of `env -S`, a shell with a dynamic script or reading stdin, `cmd //c`, `powershell -Command`, `su -c`, an interpreter's `-c`, and `nice bash -c`. Exempt is a closed list of data-only commands: `echo`, `printf`, `cat`, `grep`, `egrep`, `fgrep`, `head`, `tail`, `wc`, `tee`, and `gh` other than `gh alias`/`gh extension`. The exemption is lost when the output feeds a `>(…)` process substitution. The exemption is what keeps `grep -m 1 "git commit" CLAUDE.md` and a ledger heredoc that mentions "git commit" clean.
    - **Tier 3, fallback.** Any remaining segment is blocked when a `git` word, or a non-literal word that could become one, is followed by a literal `commit` word. The `git` word is matched dequoted, by basename, with `.exe` stripped. That covers `setsid`, `find -exec`, `pnpm exec`, `winpty`, `sudo`, a quoted or path-qualified `env`, and `$G commit`.
  - **Is the commit readable?** In a commit segment, every word from `git` up to `--` must be literal. It cannot be dynamic (`$VAR`, `$(…)`, backtick), and it cannot carry an unquoted brace, a glob, a leading `~`, ANSI-C `$'…'` or locale `$"…"` quoting. That includes flag values (`--author`, `--date`, `-S<key>`, `--cleanup=`) and global-option values (`-C`, `--git-dir`, `--work-tree`). Words after `--` are pathspecs only. Message values (`-m`, `--message`, attached, or clustered as in `-am`) and `--trailer` values must be fully quoted or backslash-escaped, with no active `$`/backtick inside double quotes. `\$`, `` \` ``, `\"`, `\\` and the `'\''` apostrophe idiom are literal. The one accepted dynamic form is the quoted-delimiter heredoc, `-m "$(cat <<'EOF' … EOF)"`. Also blocked outright:
    - `--amend`
    - a message source the hook can't see: `-F`/`--file`, `-t`/`--template`, `-c`/`-C`/`--reedit-message`/`--reuse-message`, `--fixup`, `--squash`, `-e`/`--edit`
    - any other unrecognized option, or no message flag at all
    - a `-c`/`--config-env` setting whose key is `trailer.*`/`include.*`/`includeIf.*`/`alias.*`, or whose key or value is not literal
    - a `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`/`PARAMETERS`/`GLOBAL`/`SYSTEM` assignment, in any case, set anywhere in the same command by a bare prefix, an `env` operand, or an `export`/`declare` operand. A message that merely mentions one of these names is not affected.
  - **Accepted residuals.** These are out of reach for a command-text hook, per the fix-round-3 ruling:
    - a commit whose message, flags or config come only from shell expansion
    - `git`/`cat` redefined as a shell function or alias in the same command (see `threat-model.md`)
    - a git config or alias persisted by an earlier command
    - a non-`commit` subcommand that still creates a commit: `merge -m`, `revert`, `cherry-pick`, `commit-tree`, `pull` with a merge

    **Backstop** for these: the W2-1 drift guard's check of the stored commit's real `%B` body, the W5-1 CI commit-message lint, and G8's mitigations (the owner `hold` label and the pre-submission Opus security pass).

  - **Not enforced elsewhere yet.** No git-layer `commit-msg` hook is installed. The drift guard (`checkCommitMessage` in `.claude/hooks/lib/contracts.mjs`) runs only from **W2-1** onward, and only for `/build`-style tasks. A CI commit-message lint is **planned for W5-1**. The hook imports its rules from `contracts.mjs`, which stays editable for Waves 2–4 (`config-protection.cjs` does not protect it), so PR review is the backstop for an edit there that weakens it.

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
