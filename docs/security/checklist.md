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
- [ ] Agents cannot weaken a lint/format config, `.claude/settings.json`, `.claude/settings.local.json`, or this repo's own guard-hook scripts, to make a check pass instead of fixing the problem. **Partially enforced today**: `config-protection.cjs` (this task, W1-4; extended in fix round 1) blocks `Write|Edit|MultiEdit` on exactly: known lint/format config basenames and patterns (ESLint/Prettier/Stylelint/Biome/Ruff/markdownlint); `.claude/settings.json` and `.claude/settings.local.json` (the latter blocked unconditionally, including first-time creation); and five named guard scripts — `block-no-verify.cjs`, `pre-bash-commit-quality.cjs`, `config-protection.cjs`, `protect-env.mjs`, `lib/shell-scan.cjs`. **Nothing more**: `.claude/hooks/lib/contracts.mjs` and the rest of `.claude/hooks/**` stay editable (W2–W4 need to edit them), and a Bash-tool edit (e.g. `sed -i` on any of the above) is not caught by this hook at all — CI gate G1 (lint) and a human/`pr-reviewer` diff review are the backstop for that path. **Known gap (Wave 1 final review, not yet fixed)**: `eslint.shared.cjs` — the file all 3 flat ESLint configs import, holding the actual engine-purity rules (CLAUDE.md non-negotiable 1) — matches none of the protected patterns (only `eslint.config.*` basenames are matched, not an arbitrary shared-rules filename) and is **not protected today**. The W2-1 drift guard (only for implementer-path edits) and PR review are the backstop.
- [ ] **Known gap (Wave 1 final review, not yet fixed): protection only covers the checkout the hook runs in, and only the `Bash` tool.** `config-protection.cjs` resolves protected paths (and its identity-comparison fallback) against the running hook's own `__dirname`/inode, so it does **not** protect a sibling worktree's copy of the same files — a Wave 3-4 worktree session can edit the main checkout's `settings.json`/guard scripts, or the main session can edit a worktree's copy, and an `ff-only` merge would carry that to `main`. Separately, this host's primary shell is **PowerShell**, and only the `Bash` tool is hooked (`pre-bash-commit-quality.cjs`, `block-no-verify.cjs`) — a `git commit --no-verify` with an attribution line run through the PowerShell tool passes every Wave 1 guard undetected. Also: all three hooks register with a relative path (`node .claude/hooks/...`) and **fail open (exit 1, non-blocking) if the session's working directory isn't the repo root** — confirmed live from a subdirectory. None of these three are enforced by any automated test today; backstop is the W2-1 drift guard (implementer-path edits only) and human/PR review. Recommended fix (needs the owner to toggle `config-protection` off to edit `settings.json`/the guard scripts): switch hook commands to `${CLAUDE_PROJECT_DIR}`-qualified paths and/or `"onFailure": "block"`, and add a `PowerShell(...)` matcher alongside `Bash(...)` for the deny rules and both commit-time hooks.

## Commit message integrity

- [ ] A `git commit` that the hook can see in a Bash-tool command's text is BLOCKED (exit 2) unless it has a conventional-commit message with no `Co-Authored-By`/"Generated with" attribution (in a message or a `--trailer`, colon or `=` form), is not an `--amend`, and has a message the hook can read literally. It blocks, it does not warn. **Enforced today**: `pre-bash-commit-quality.cjs` (PreToolUse, `Bash` matcher; tests in `.claude/hooks/tests/commit-hook.test.mjs` and `ecc-hooks.test.mjs`). The hook reads only the command text. It works in two layers.
  - **Is this a commit?** The vendored scanner (`lib/shell-scan.cjs`) splits the command into simple commands (on `&&`, `||`, `;`, `|`, newlines and subshells, and inside every `$(…)`). Three closed tiers then classify each one. The data-only commands listed under Tier 2 are exempt from Tiers 2 and 3:
    - **Tier 1, parsed.** The hook parses `git` (after literal `NAME=value` prefixes and the transparent `env`/`command`/`time`/`builtin`/`!`/`if`/`then`/`do`/… prefixes with their known options). It also parses `bash`/`sh`/`dash`/`zsh`/`ksh` with a literal `-c` script, which it scans again as its own command. The shell option walk treats `-o`/`-O` as taking the next word wherever they sit in a cluster (`-co pipefail`, `-ceo pipefail`). A git invocation whose literal subcommand is not `commit` is not a candidate. A non-literal subcommand word (`co{mmit,}`) is blocked. An unrecognized git global option (one this hook does not list) sends the segment to Tiers 2 and 3 rather than letting its value word be read as the subcommand.
    - **Tier 2, opaque string.** Any other command is blocked as unreadable if its own text, or the stdin it is fed (a heredoc, a here-string, or the pipeline feeding it), matches `git … commit` (a `.git` directory name does not count as `git`, so `ls .git/hooks/pre-commit` is clean). That covers `eval`, any spelling of `env -S`, a shell with a dynamic script or reading stdin, `cmd //c`, `powershell -Command`, `su -c`, an interpreter's `-c`, `nice bash -c`, and also a `git commit` behind any wrapper the hook does not parse (`setsid`, `sudo`, `find -exec`, `pnpm exec`, `winpty`, a quoted or path-qualified `env`). Exempt is a closed list of data-only commands: `echo`, `printf`, `cat`, `grep`, `egrep`, `fgrep`, `head`, `tail`, `wc`, `tee`, and only these `gh` subcommands: `pr`, `issue`, `api`, `release`, `run`, `workflow`, `label`, `search`, `status`. Every other `gh` subcommand (`browse`, `config`, `alias`, `extension`, `repo`, …) is checked like any other command, since gh can run a browser, editor, pager, alias or extension. The exemption is also lost when the output feeds a `>(…)` process substitution, or when an assignment prefix or `env` operand in front of the command carries `git … commit` text (`GH_BROWSER="sh -c '…'" gh pr view --web`). The exemption is what keeps `grep -m 1 "git commit" CLAUDE.md` and a ledger heredoc that mentions "git commit" clean.
    - **Tier 3, fallback.** Tier 3 adds coverage only for a non-literal word that could resolve to `git` (`$G`, an ANSI-C `$'\x67it'`, a glob such as `/usr/bin/gi?`) followed by a literal `commit` word elsewhere in the segment, which Tier 2's text pattern cannot see. A literal `git` word behind a wrapper is already caught by Tier 2.
  - **Is the commit readable?** In a commit segment, every word from `git` up to `--` must be literal. It cannot be dynamic (`$VAR`, `$(…)`, backtick), and it cannot carry an unquoted brace, a glob, a leading `~`, ANSI-C `$'…'` or locale `$"…"` quoting. That includes flag values (`--author`, `--date`, `-S<key>`, `--cleanup=`) and global-option values (`-C`, `--git-dir`, `--work-tree`). Words after `--` are pathspecs only. Message values (`-m`, `--message`, attached, or clustered as in `-am`) and `--trailer` values must be fully quoted or backslash-escaped, with no active `$`/backtick inside double quotes. `\$`, `` \` ``, `\"`, `\\` and the `'\''` apostrophe idiom are literal. The one accepted dynamic form is the quoted-delimiter heredoc, `-m "$(cat <<'EOF' … EOF)"`. Also blocked outright:
    - `--amend`
    - a message source the hook can't see: `-F`/`--file`, `-t`/`--template`, `-c`/`-C`/`--reedit-message`/`--reuse-message`, `--fixup`, `--squash`, `-e`/`--edit`
    - any other unrecognized option, or no message flag at all
    - a `-c`/`--config-env` setting whose key is `trailer.*`/`include.*`/`includeIf.*`/`alias.*`, or whose key or value is not literal
    - a `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`/`PARAMETERS`/`GLOBAL`/`SYSTEM` assignment, in any case, set anywhere in the same command by a bare prefix, an `env` operand, or an `export`/`declare` operand. A message that merely mentions one of these names is not affected.
  - **Accepted residuals.** These are out of reach for a command-text hook, per the fix-round-3 ruling:
    - a commit whose message, flags or config come only from shell expansion
    - `git`/`cat` redefined as a shell function or alias in the same command (see `threat-model.md`)
    - persisted or separately set state that changes what a later command runs: a git config or alias that changes what a non-`commit` git invocation does, whether persisted beforehand, or set via `-c`/`--config-env`/`GIT_CONFIG_*` on a different, non-commit git invocation in the same or an earlier command (for example `git -c alias.ci=commit ci`); persisted `gh` config (its browser, editor or pager); an environment variable set in an earlier, separate command (for example `GIT_EDITOR` or `GH_BROWSER`); or a script file the command wrote and then ran, or command-line arguments assembled at runtime by another program from piped/stdin data (for example `xargs`)
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
