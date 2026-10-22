#!/usr/bin/env node
// Adapted from affaan-m/ECC (MIT) @ 90606c8
/**
 * PreToolUse Hook: Pre-commit Quality Check
 *
 * Runs quality checks before git commit commands:
 * - Detects staged files
 * - Runs linter on staged files (if available)
 * - Checks for common issues (console.log, TODO, etc.)
 * - Validates commit message format (if provided)
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Adaptations from upstream ECC (controller ruling W1-a):
 * - Commit-message issues (format, length, AI-attribution lines) now BLOCK
 *   (exit 2) instead of only warning. Upstream only warned about them.
 * - validateCommitMessage() reuses checkCommitMessage() from
 *   .claude/hooks/lib/contracts.mjs (our COMMIT_TYPES, SUBJECT_MAX_CHARS and
 *   the Co-Authored-By / "Generated with" attribution ban) instead of its own
 *   conventional-commit regex, so this hook and the gate-checker drift guard
 *   can never disagree about what a valid commit message looks like.
 * - Multiple -m/--message flags are now joined the way `git commit` joins
 *   them (first flag is the subject, the rest become body paragraphs
 *   separated by a blank line) before validation, instead of only reading
 *   the first -m.
 *
 * Exit codes:
 *   0 - Success (allow commit)
 *   2 - Block commit (quality issues found)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const MAX_STDIN = 1024 * 1024; // 1MB limit

/**
 * Detect staged files for commit
 * @returns {string[]} Array of staged file paths
 */
function getStagedFiles() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.trim().split('\n').filter(f => f.length > 0);
}

function getStagedFileContent(filePath) {
  const result = spawnSync('git', ['show', `:${filePath}`], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout;
}

/**
 * Check if a file should be quality-checked
 * @param {string} filePath
 * @returns {boolean}
 */
function shouldCheckFile(filePath) {
  const checkableExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs'];
  return checkableExtensions.some(ext => filePath.endsWith(ext));
}

/**
 * Decide whether a captured api-key value is an OBVIOUS non-secret placeholder so
 * the heuristic generic api-key rule does not emit a false positive. Deliberately
 * narrow: only suppresses whole-value env references / interpolations / angle-bracket
 * tokens and a short explicit whitelist of placeholder + env-var NAME tokens. It must
 * NOT suppress arbitrary high-entropy data (uppercase-hex, base32, digit-only, mixed
 * tokens), since the generic rule is the only net catching non-prefixed secrets and a
 * false-negative there is the safety-critical failure this hook exists to prevent.
 * @param {string} value
 * @returns {boolean}
 */
function isPlaceholderSecret(value) {
  const v = (value || '').trim();
  if (v.length === 0) return true;                                  // empty value
  if (/^process\.env\.[A-Za-z0-9_]+$/.test(v)) return true;          // entire value is a process.env.NAME reference
  if (/^\$\{[^}]*\}$/.test(v)) return true;                          // entire value is a ${...} interpolation
  if (/^<[^<>]*>$/.test(v)) return true;                             // entire value is a <PLACEHOLDER> token
  // Short explicit whitelist of placeholder + env-var NAME tokens (whole-value match only).
  // No general all-caps clause: real all-caps/hex/base32/digit secrets must still flag.
  if (/^(REPLACE_ME|CHANGE_?ME|YOUR[_-]?API[_-]?KEY|YOUR[_-]?KEY[_-]?HERE|API[_-]?KEY|SECRET|TOKEN|KEY|TODO|TBD|FIXME|XXX+)$/i.test(v)) return true;
  return false;
}

/**
 * Find issues in file content
 * @param {string} filePath
 * @returns {object[]} Array of issues found
 */
function findFileIssues(filePath) {
  const issues = [];

  try {
    const content = getStagedFileContent(filePath);
    if (content === null || content === undefined) {
      return issues;
    }
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for console.log
      if (line.includes('console.log') && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('#')) {
        issues.push({
          type: 'console.log',
          message: `console.log found at line ${lineNum}`,
          line: lineNum,
          severity: 'warning'
        });
      }

      // Check for debugger statements
      if (/\bdebugger\b/.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('#')) {
        issues.push({
          type: 'debugger',
          message: `debugger statement at line ${lineNum}`,
          line: lineNum,
          severity: 'error'
        });
      }

      // Check for TODO/FIXME without issue reference
    const todoMatch = line.match(/(?:\/\/|#)\s*(TODO|FIXME):?\s*(\S.*)/);
      if (todoMatch && !todoMatch[2].match(/#\d+|issue/i)) {
        issues.push({
          type: 'todo',
          message: `TODO/FIXME without issue reference at line ${lineNum}: "${todoMatch[2].trim()}"`,
          line: lineNum,
          severity: 'info'
        });
      }

      // Check for hardcoded secrets (basic patterns)
      const secretPatterns = [
        { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/, name: 'Anthropic API key' },
        { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
        { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub PAT' },
        { pattern: /AKIA[A-Z0-9]{16}/, name: 'AWS Access Key' },
        // Capture the quoted value so obvious non-secret placeholders can be excluded
        { pattern: /api[_-]?key\s*[=:]\s*['"]([^'"]+)['"]/i, name: 'API key', valueGroup: 1 },
        // Unquoted form (API_KEY=..., api_key: ... without quotes). Scoped to a
        // single alnum/underscore/hyphen token of 12+ chars containing at least
        // one digit — real secrets are near-always alphanumeric, whereas bare
        // identifiers/expressions common in this hook's checkable languages
        // (config.apiKey, getApiKey(), process.env.API_KEY) are pure-alpha or
        // contain '.'/'(' that fall outside the character class, so they don't
        // match. Kept deliberately narrow to avoid flagging ordinary code.
        { pattern: /api[_-]?key\s*[=:]\s*(?!['"])((?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,})/i, name: 'API key', valueGroup: 1 }
      ];

      for (const { pattern, name, valueGroup } of secretPatterns) {
        const secretMatch = line.match(pattern);
        if (secretMatch && !(valueGroup && isPlaceholderSecret(secretMatch[valueGroup]))) {
          issues.push({
            type: 'secret',
            message: `Potential ${name} exposed at line ${lineNum}`,
            line: lineNum,
            severity: 'error'
          });
        }
      }
    });
  } catch {
    // File not readable, skip
  }

  return issues;
}

// Fix round 1 (controller-reviewed bypasses): commit detection and message
// reading are now parse-based, not substring-based. See
// docs/security/checklist.md and the "Fix round 1" section of the W1-4
// report for the exact bypasses this replaces and why.
//
// Fix round 2 (N2, a regression vs. the original 702cb8f substring check):
// a `git ... commit ...` invocation wrapped by `env`/`command`/`time`/`!`/a
// compound-command keyword, embedded in a `bash -c '…'`/`sh -c '…'`
// argument, or embedded in a `$( … )` command substitution anywhere in the
// command must still be found — not just a bare leading `git`.
//
// Principle: once a `git ... commit` invocation is detected anywhere in the
// command (including after shell chaining, global git options, an
// environment-variable prefix, or any of the wrapping forms above), either
// every part of its message is read literally and validated, or the commit
// is BLOCKED (exit 2) with a hint. Nothing is ever passed through unread.
const { createBudget, scanShell } = require('./lib/shell-scan.cjs');

function basename(value) {
  return value.replace(/\\/g, '/').split('/').pop();
}

function isGitExecutable(value) {
  const name = basename(value).toLowerCase();
  return name === 'git' || name === 'git.exe';
}

// A leading `KEY=value` shell-assignment word (e.g. `GIT_AUTHOR_NAME=x`,
// `MSG=foo`) before the executable. Only literal prefix assignments are
// skipped here — this hook does not need to track exported environment
// state the way block-no-verify.cjs's hook-bypass scanner does; it only
// needs to walk past them to find the git invocation itself.
const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Fix round 2 (N2): a command whose real subcommand is `git ... commit ...`
// but is itself prefixed by a wrapper word — `env`, `command`, `time`, a
// bare `!`, or a leading compound-command keyword word (`if`, plus `then`/
// `elif`/`else`/`while`/`until`/`do`, which is how the vendored scanner
// represents the START of an `if`/`while`/`for` BODY once `;`/newline has
// split it from its own `if`/`while`/`for` word — `if` itself is needed too,
// since an `if`'s own CONDITION command runs directly as `if`'s argument,
// e.g. `if git commit -m "x"; then :; fi`) — must still be found. These are
// skipped one word at a time, repeatedly interleaved with `KEY=value`
// assignment prefixes, until a non-wrapper word is reached. `builtin` is
// included for the same reason even though it is not in the findings'
// required test list: it is the same class of wrapper as `command`.
const WRAPPER_SKIP_WORDS = new Set([
  'env', 'command', 'time', 'builtin', '!',
  'if', 'then', 'elif', 'else', 'while', 'until', 'do'
]);

// Advisor review round (fix round 2, second pass): only `env`/`command`/
// `time` take their OWN options (`env -i`, `command -p`, `time -p`) — a
// bare compound keyword or `!` never does. Without skipping these, the
// wrapper word was found but the option word right after it (not `git`)
// became "the next word", so the git executable was never reached.
const WRAPPERS_WITH_OWN_OPTIONS = new Set(['env', 'command', 'time']);
// `env -u NAME`/`--unset NAME` and `env -C dir`/`--chdir dir` consume a
// SEPARATE following word as their operand — skipping only the option word
// itself would misread that operand as the next flag (or as `git`).
const ENV_OPTIONS_WITH_SEPARATE_VALUE = new Set(['-u', '--unset', '-C', '--chdir']);

// Fix round 3, Rule 2: a QUOTED assignment VALUE (`GIT_AUTHOR_NAME="A B"`)
// is still perfectly literal and readable — `word.quoted` only means SOME
// part of the word was inside quotes, not that the word is unsafe. The
// PREVIOUS `!words[i].quoted` guard here was a real regression vs. the
// original 702cb8f substring check: it stopped unwrapping entirely at the
// first quoted assignment, so `GIT_AUTHOR_NAME="A B" git commit ...` was
// never even recognized as a commit at all. Only a DYNAMIC assignment value
// (`X=$(...) git commit ...`) is unsafe — same literalness rule as
// everywhere else — and is reported via `hasDynamicAssignment` so the
// caller can block the segment instead of silently reading past it.
function skipLeadingAssignments(words, start) {
  let i = start;
  let hasDynamicAssignment = false;
  while (i < words.length && SHELL_ASSIGNMENT.test(words[i].raw)) {
    if (words[i].dynamic) hasDynamicAssignment = true;
    i++;
  }
  return { index: i, hasDynamicAssignment };
}

// Fix round 3, Rule 5: `env -S`/`--split-string` re-tokenizes a literal
// payload into argv words FOR the wrapped command — fundamentally different
// from plain `env`, which just runs its next argument directly. Treating it
// as transparently unwrappable (like plain `env`) would misread its payload
// as if it were already the wrapped command's own arguments. `unwrapCommandStart`
// stops and reports `opaque: true` instead, so the caller applies Rule 5's
// "block when the text mentions commit" rule rather than guessing.
function isEnvSplitStringFlag(value) {
  return value === '-S' || value === '--split-string'
    || value.startsWith('--split-string=') || value.startsWith('-S');
}

function unwrapCommandStart(words) {
  let i = 0;
  let hasDynamicAssignment = false;
  for (;;) {
    const skipped = skipLeadingAssignments(words, i);
    hasDynamicAssignment = hasDynamicAssignment || skipped.hasDynamicAssignment;
    const next = skipped.index;
    const word = words[next];
    if (!word || word.quoted || !WRAPPER_SKIP_WORDS.has(word.value)) {
      return { start: next, opaque: false, hasDynamicAssignment };
    }
    const wrapperWord = word.value;
    i = next + 1;
    if (!WRAPPERS_WITH_OWN_OPTIONS.has(wrapperWord)) continue;
    while (i < words.length && !words[i].quoted && words[i].value.startsWith('-') && words[i].value !== '--') {
      if (wrapperWord === 'env' && isEnvSplitStringFlag(words[i].value)) {
        return { start: next, opaque: true, hasDynamicAssignment };
      }
      if (wrapperWord === 'env' && ENV_OPTIONS_WITH_SEPARATE_VALUE.has(words[i].value)) { i += 2; continue; }
      i++;
    }
    if (i < words.length && !words[i].quoted && words[i].value === '--') i++;
  }
}

// Fix round 3, Rule 2: git reads GIT_CONFIG_COUNT/GIT_CONFIG_KEY_n/
// GIT_CONFIG_VALUE_n/GIT_CONFIG_PARAMETERS identically whether set as a
// bare leading assignment, via `env NAME=value cmd`, or via an earlier
// `export` elsewhere in the same overall command text — a per-segment,
// per-assignment-word check can't see all three shapes without real
// variable-flow tracking. A single belt-and-braces scan of the WHOLE raw
// command text is the same "defense in depth" pattern already used for
// attribution (hasAttributionInRawText): if this pattern appears ANYWHERE
// and a commit is also found anywhere, block every segment outright — there
// is no legitimate reason an automated commit needs any of these.
const GIT_CONFIG_ENV_PATTERN = /\bGIT_CONFIG_(?:COUNT|KEY_[0-9]+|VALUE_[0-9]+|PARAMETERS)\s*=/;

function hasGitConfigEnvInjection(command) {
  return GIT_CONFIG_ENV_PATTERN.test(command);
}

// git global options that take a separate value word (space-separated:
// `-c key=value`, `-C <dir>`, …). Matches the set block-no-verify.cjs scans
// past for the same reason: so the real subcommand word is found correctly.
const GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE = new Set([
  '-c', '-C', '--config-env', '--work-tree', '--git-dir', '--namespace', '--super-prefix'
]);

// Fix round 3, Rule 3: generalizes N3's `trailer.*.key`-only check. A `-c`/
// `--config-env` setting is unsafe when its KEY matches a sensitive config
// namespace (trailers can be aliased into attribution text; `include`/
// `includeIf` can inject an entire extra config file; `alias` can redefine
// what a git subcommand even means) — no legitimate automated commit needs
// to set any of these — OR when the key or value half is not literal
// (word.dynamic, or an unquoted brace/glob/tilde expansion): a non-literal
// setting could become anything by the time git actually reads it,
// including a sensitive key this hook would otherwise recognize and block.
const UNSAFE_CONFIG_KEY_PATTERN = /^(trailer\.|include\.|includeif\.|alias\.)/i;

function isUnsafeConfigKey(setting) {
  return UNSAFE_CONFIG_KEY_PATTERN.test(String(setting).split('=')[0]);
}

// `settingText` is the DEQUOTED "key=value" (or bare "key") text to
// pattern-match; `word` is the WORD it was read from (the whole flag word
// for an inline `-cKEY=VALUE`/`--config-env=KEY=VALUE` form, since
// `word.dynamic` is tracked per-WHOLE-word anyway, or the separate next-word
// for the space-separated form) — used only for the literalness check.
function checkConfigSetting(unsafeConfigs, settingText, word) {
  if (settingText === undefined) return;
  if (!word || !isLiteralWord(word)) { unsafeConfigs.push(settingText); return; }
  if (isUnsafeConfigKey(settingText)) unsafeConfigs.push(settingText);
}

// Returns the word index of the subcommand (e.g. `commit`) after `git` and
// any global options, or -1 when `words[start]` is not a git invocation at
// all. Handles space-separated global option values (`-c k=v`, `-C <dir>`)
// and inline forms (`-ck=v`, `--config-env=x`) by simply skipping one word
// per flag when it is not one of the known separate-value options — good
// enough to locate the subcommand; this hook does not need to resolve what
// those options' values actually are the way block-no-verify.cjs does. Any
// `-c`/`--config-env` setting checkConfigSetting flags is recorded into
// `unsafeConfigs` (mutated in place) regardless of whether this turns out
// to be a `commit` invocation — the caller only reads it once `commit` is
// confirmed.
function findGitSubcommandIndex(words, start, unsafeConfigs) {
  if (!words[start] || !isGitExecutable(words[start].value)) return -1;
  let index = start + 1;
  while (index < words.length) {
    const word = words[index];
    const value = word.value;
    if (!value.startsWith('-')) break;
    if (value === '--') { index++; break; }
    if (value === '-c' || value === '--config-env') {
      checkConfigSetting(unsafeConfigs, words[index + 1]?.value, words[index + 1]);
      index += 2;
      continue;
    }
    if (value.startsWith('-c') && !value.startsWith('--')) {
      checkConfigSetting(unsafeConfigs, value.slice(2), word);
      index++;
      continue;
    }
    if (value.startsWith('--config-env=')) {
      checkConfigSetting(unsafeConfigs, value.slice('--config-env='.length), word);
      index++;
      continue;
    }
    if (GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE.has(value)) { index += 2; continue; }
    index++;
  }
  return index < words.length ? index : -1;
}

function addGitCommitSegment(words, unwrap, text, segments) {
  const unsafeConfigs = [];
  const subcommandIndex = findGitSubcommandIndex(words, unwrap.start, unsafeConfigs);
  if (subcommandIndex === -1 || words[subcommandIndex].value !== 'commit') return;
  segments.push({
    words,
    commitIndex: subcommandIndex,
    start: words[0].start,
    end: words[words.length - 1].end,
    sourceText: text,
    unsafeConfigs,
    hasDynamicAssignment: unwrap.hasDynamicAssignment
  });
}

// Fix round 2 (N2): `bash -c '…'`/`sh -c '…'` — the quoted argument is
// further shell source text, not a message or data; every POSIX shell
// (including git-bash on Windows) runs it as a fresh command. Matches the
// same `SHELLS` set block-no-verify.cjs scans for its own `-c`/stdin-source
// detection, for the same reason: dash/zsh/ksh all share bash's `-c`
// convention.
const SHELL_DASH_C_EXECUTABLES = new Set([
  'bash', 'bash.exe', 'sh', 'sh.exe', 'dash', 'dash.exe', 'zsh', 'zsh.exe', 'ksh', 'ksh.exe'
]);

function isShellDashCExecutable(value) {
  return SHELL_DASH_C_EXECUTABLES.has(basename(value).toLowerCase());
}

// Fix round 3, Rule 4: `-c` is rarely the FIRST flag — `-lc`, `-ec`, a
// preceding `--norc`/`--noprofile`/`--posix` long flag, or `--rcfile <file>`/
// `--init-file <file>` (which consume a separate value word) are all
// common. Deliberately simpler than block-no-verify.cjs's own shell-role
// parser: good enough to find a `-c`-family invocation's script argument,
// not to classify every shell flag shape. Returns the index of the script
// argument word, or -1 whenever the shape is anything this walk doesn't
// confidently recognize — a bare `--`/`-`, a QUOTED flag-shaped word
// (`"-c"`), an `-o`/`-O` cluster (takes a value this walk doesn't model,
// e.g. `-o pipefail`), or simply no `-c` found at all (a script FILE
// argument, or the shell reading stdin/a heredoc). -1 is deliberately
// treated by the caller as "I don't know", not "this is safe".
const SHELL_LONG_FLAGS_NO_VALUE = new Set([
  '--noprofile', '--norc', '--posix', '--restricted', '--verbose', '--login'
]);
const SHELL_LONG_FLAGS_WITH_VALUE = new Set(['--rcfile', '--init-file']);

function findShellScriptIndex(words, start) {
  let i = start + 1;
  let sawDashC = false;
  while (i < words.length) {
    const word = words[i];
    const value = word.value;
    if (value === '--' || value === '-') return -1;
    if (SHELL_LONG_FLAGS_WITH_VALUE.has(value)) { i += 2; continue; }
    if (SHELL_LONG_FLAGS_NO_VALUE.has(value)) { i++; continue; }
    if (/^[-+][A-Za-z]+$/.test(value)) {
      // Rule 4: a QUOTED flag-shaped word (`"-c"`) is unrecognized — a real
      // shell's own option parser works on raw argv text, not on whether
      // the AGENT happened to quote it, so this hook must not silently
      // treat a quoted "-c" the same as a bare -c. This check is scoped to
      // words that already LOOK like an option cluster — the eventual
      // script argument itself is always (and legitimately) quoted, and is
      // reached via the `break` below, never this branch.
      if (word.quoted) return -1;
      if (value.includes('c')) sawDashC = true;
      else if (/[oO]/.test(value)) return -1;
      i++;
      continue;
    }
    break;
  }
  if (!sawDashC) return -1;
  return i < words.length ? i : -1;
}

// Fix round 3, Rules 4/5: wrappers this hook does not try to unwrap at all
// (`sudo`, `exec`, `eval`, `nohup`, `timeout`, `nice`, `xargs`) — if the
// segment's text contains "commit" anywhere, block as unreadable rather
// than attempt to parse further into an unbounded set of wrapper shapes.
const OPAQUE_WRAPPER_WORDS = new Set([
  'sudo', 'exec', 'eval', 'nohup', 'timeout', 'nice', 'xargs'
]);

function commandRawText(words, text) {
  if (!words.length) return '';
  return text.slice(words[0].start, words[words.length - 1].end);
}

// Fix round 3, Rules 4/5: a cheap, deliberately simple "does this command
// text mention commit at all" pre-check — walks the whole pipe chain
// (`cmd.pipeFrom`) and every heredoc/here-string body attached to any
// command in that chain, since `echo '...git commit...' | bash` and
// `bash <<'EOF' ... git commit ... EOF` both feed a shell's stdin rather
// than a -c argument. Not a security analysis of its own (no recursion into
// further substitutions here) — just the signal that decides whether an
// unparseable wrapper/shell shape should block or silently pass. Reusing
// block-no-verify.cjs's own (far more thorough) unwrapping machinery here
// would pull in a dependency this narrower job doesn't need; a local text
// scan is enough for "block when in doubt".
function commandSearchText(cmd, text) {
  const parts = [];
  for (let current = cmd; current; current = current.pipeFrom) {
    parts.push(commandRawText(current.words, text));
    for (const redirect of current.redirects) {
      if (redirect.operator === '<<<') parts.push(redirect.word.value);
      else if (redirect.operator === '<<' || redirect.operator === '<<-') parts.push(redirect.body);
    }
  }
  return parts.join('\n');
}

function blockIfLooksLikeCommit(cmd, text, segments) {
  if (!/commit/i.test(commandSearchText(cmd, text))) return;
  segments.push({
    opaqueBlock: true,
    reason:
      'commit-message-unreadable: an unrecognized wrapper, shell invocation shape, or ' +
      'dynamic command word could not be safely parsed, and the command text mentions ' +
      '"commit" — blocked rather than guessed at'
  });
}

// Fix round 3, Rule 4: recurse into a shell `-c`-family argument ONLY when
// the option walk unambiguously finds a single script word AND that word is
// fully literal (Rule 1's standard, via isLiteralWord). Anything else — an
// unrecognized option shape, no `-c` found at all (a script file, stdin, a
// heredoc), or a dynamic/brace-expanded script argument — is blocked
// outright when the segment's own text contains "commit", rather than
// silently passed through. This is what closes round 2's own new-breakage
// item 1: an outer-shell `$VAR`/`$(...)` landing inside the inner script's
// quotes looked literal from the outside but wasn't once re-examined; the
// dynamic check here is on the ARGUMENT WORD ITSELF, before any recursion,
// so it can never be fooled by what the inner text looks like after
// substitution.
function maybeHandleShellWrapper(words, start, cmd, text, budget, segments) {
  const scriptIndex = findShellScriptIndex(words, start);
  if (scriptIndex !== -1) {
    const script = words[scriptIndex];
    if (script && isLiteralWord(script)) {
      collectCommitSegments(script.value, budget, segments);
      return;
    }
  }
  blockIfLooksLikeCommit(cmd, text, segments);
}

// Fix round 3: replaces round 2's `addCommitSegmentIfPresent` +
// `maybeRecurseIntoShellDashC` pair with one dispatcher per simple command,
// classifying its (unwrapped) command word as exactly one of: a git
// invocation (parsed fully), a shell `-c`-family invocation (recursed into
// only when safe, else blocked-if-mentions-commit), another wrapper or a
// dynamic command word (blocked-if-mentions-commit, never unwrapped), or
// anything else — a literal non-git, non-shell, non-wrapper command, which
// is NOT a candidate at all and must stay silent (`grep -m 1 "git commit"
// CLAUDE.md`, `cat >> foo <<'EOF' ... EOF`, `time pnpm verify`, `env
// NODE_ENV=test node ...` all still exit 0 untouched).
function processCommandForCommitSegments(cmd, text, budget, segments) {
  const words = cmd.words;
  const unwrap = unwrapCommandStart(words);
  if (unwrap.opaque) { blockIfLooksLikeCommit(cmd, text, segments); return; }
  const word = words[unwrap.start];
  if (!word) return;
  if (word.dynamic) { blockIfLooksLikeCommit(cmd, text, segments); return; }
  if (isGitExecutable(word.value)) {
    addGitCommitSegment(words, unwrap, text, segments);
    return;
  }
  if (isShellDashCExecutable(word.value)) {
    maybeHandleShellWrapper(words, unwrap.start, cmd, text, budget, segments);
    return;
  }
  if (OPAQUE_WRAPPER_WORDS.has(basename(word.value).toLowerCase())) {
    blockIfLooksLikeCommit(cmd, text, segments);
  }
}

/**
 * Scan `text` for `git ... commit ...` invocations, pushing one entry per
 * match (or one opaque-block marker) onto `segments` (shared across the
 * whole recursive scan). Recurses into forms a single word-level scan can't
 * see directly: a shell `-c`-family argument's literal text (Rule 4), and
 * any `$( … )` command-substitution text found anywhere in a command
 * (`cmd.nested`, already populated by the vendored scanner) — both
 * re-tokenized as their own independent command source, recursively.
 * `budget` is shared across every recursive call so the total scanning work
 * stays bounded by the OUTERMOST command's length, the same way
 * block-no-verify.cjs's own recursive scan is bounded.
 *
 * @param {string} text
 * @param {object} budget
 * @param {object[]} segments
 */
function collectCommitSegments(text, budget, segments) {
  budget.spend(text.length + 1);
  const scan = scanShell(text, budget);
  for (const cmd of scan.commands) {
    if (cmd.scopeExit || !cmd.words.length) continue;
    processCommandForCommitSegments(cmd, text, budget, segments);
    for (const nested of cmd.nested) collectCommitSegments(nested, budget, segments);
  }
}

/**
 * Parse `command` with the vendored shell scanner and return one entry per
 * `git ... commit ...` invocation found anywhere in it — including behind
 * `env`/`command`/`time`/`!`/a compound-command keyword, inside a `bash -c
 * '…'`/`sh -c '…'` argument, or inside a `$( … )` command substitution
 * (splitting on `&&`, `||`, `;`, `|` and newlines is scanShell's job, not
 * ours — it already returns one `commands[]` entry per segment; subshells
 * `( … )`/`{ … ; }` are walked the same way, since the commands inside them
 * are also plain entries in `scan.commands`). A `grep -m 1 "git commit"
 * CLAUDE.md` never matches: `grep` is not `git`, so this never even looks at
 * its arguments.
 *
 * @param {string} command
 * @returns {{words: object[], commitIndex: number, start: number, end: number, sourceText: string, unsafeConfigs: string[]}[]}
 */
function findCommitSegments(command) {
  const budget = createBudget(command.length);
  const segments = [];
  collectCommitSegments(command, budget, segments);
  return segments;
}

// Only the accepted heredoc shape, with a QUOTED delimiter, is trusted as
// literal text: `"$(cat <<'EOF' ... EOF\n)"` (double or single quotes around
// the delimiter; optional `<<-`). A quoted delimiter stops the real shell
// from expanding anything inside the heredoc body, so a `$(...)` or backtick
// there is ordinary data (e.g. a commit message quoting a code span), never
// an unresolved substitution. An UNQUOTED delimiter (`<<EOF`) is explicitly
// NOT matched here: the real shell WOULD expand `$(...)`/backticks inside
// that body before `cat` ever saw it, so this hook cannot know what git
// would actually receive — the caller must treat that as unreadable.
const HEREDOC_VALUE_PATTERN =
  /^"\$\(\s*cat\s+<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\2[ \t]*\r?\n?\)"$/;

function readHeredocValue(rawToken) {
  const match = String(rawToken).match(HEREDOC_VALUE_PATTERN);
  if (!match) return undefined;
  const delimiter = match[2];
  const body = match[3];
  // Defense in depth against a forged heredoc: the body group above is
  // lazy, so it only matches as far as it must to find a FINAL
  // `\n<delimiter>\n)"` at the very end of the token. If the "body" already
  // contains an EARLIER line that is exactly the delimiter, a real shell
  // would have closed the heredoc there instead — everything folded into
  // "body" after that point is further shell source (e.g. `echo …; cat
  // <<'EOF' …`), whose actual stdout, not this literal text, becomes part
  // of the real message. We cannot know what that would produce, so the
  // whole value is unreadable rather than trusted.
  const forged = body.split(/\r?\n/).some((line) => line.trim() === delimiter);
  if (forged) return undefined;
  return body;
}

// ANSI-C quoting ($'...'): a real shell expands backslash escapes inside it
// (notably \n to an actual newline). The vendored shell scanner
// deliberately does not simulate that expansion (it keeps the two literal
// characters `\` and `n`, and does not mark the word `dynamic` — single
// quotes, including the `'` half of `$'`, suppress command substitution,
// which is the only expansion this scanner models). Reading such a value's
// `.value` directly would therefore validate different text than git would
// actually receive (e.g. a one-line subject when the real message is
// multi-line with a trailer on its own line) — unreadable, not literal.
function isAnsiCQuoted(raw) {
  return /^\$'/.test(String(raw));
}

// Fix round 2 (N1): a value is trusted as literal text only when EVERY
// character in `raw` is inside a quote — single quotes (opaque to this
// hook's own expansion model, matching bash), or double quotes containing
// none of `$`/backtick. A SINGLE stray unquoted character anywhere — not
// just a `$(...)`/backtick — means a real shell could transform this text
// (brace expansion, globbing, tilde expansion, word splitting) before git
// ever sees it, so the value is unreadable, not literal. This is what
// catches `-m{,}'Co-Authored-By: X'`: bash brace-expands the unquoted `{,}`
// before git ever runs, but the vendored scanner's own `dynamic` flag (which
// only tracks `$(...)`/backtick) never flags it, so without this check the
// pre-expansion text (containing the literal `{,}` noise) is read and
// validated instead of what git would actually receive.
//
// Fix round 3, correction 1: `{ } * ? [ ~` were WRONGLY included here too.
// Bash does not brace-expand, glob, or tilde-expand inside "..." — only `$`
// and backtick remain active there — so this was blocking harmless literal
// subjects like `-m "fix: why does it fail?"` or
// `-m "fix(engine): handle [edge] case"` for no security benefit. Those
// characters are still checked, but only when truly UNQUOTED — see
// `hasUnquotedExpansionChar` (fix round 3, Rule 1), which every word in a
// commit segment is checked against, not just a flag's own value.
const FORBIDDEN_IN_DOUBLE_QUOTES = /[$`]/;

function findDoubleQuoteEnd(text, start) {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) { i += 2; continue; }
    if (text[i] === '"') return i;
    i++;
  }
  return -1;
}

function isFullyQuotedLiteral(raw) {
  const text = String(raw);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      if (close === -1) return false;
      i = close + 1;
      continue;
    }
    if (c === '"') {
      const close = findDoubleQuoteEnd(text, i + 1);
      if (close === -1) return false;
      if (FORBIDDEN_IN_DOUBLE_QUOTES.test(text.slice(i + 1, close))) return false;
      i = close + 1;
      continue;
    }
    return false; // an unquoted character anywhere makes the whole value unreadable
  }
  return true;
}

const NOT_FULLY_QUOTED_REASON =
  'message value is not fully quoted (an unquoted, brace-expanded, globbed or ' +
  "tilde character would reach git differently than read here); use -m '…' or " +
  'the quoted heredoc form';

// Fix round 3, Rule 1: characters that still actively expand when UNQUOTED
// (brace expansion, globbing, tilde expansion) — inert inside BOTH `'...'`
// and `"..."` (bash does not brace/glob/tilde-expand inside quotes of
// either kind — see correction 1 above), so only an occurrence OUTSIDE any
// quote matters here. `$` and backtick are deliberately NOT in this set:
// those are already tracked by the vendored scanner's own `word.dynamic`
// flag (and a backslash-escaped occurrence, e.g. `\$foo`, never reaches the
// scanner's dynamic-marking logic either, nor this check — see below).
const UNQUOTED_EXPANSION_CHARS = /[{}*?[~]/;

// Scans raw word text tracking quote state; true when one of
// UNQUOTED_EXPANSION_CHARS appears OUTSIDE any quote. A backslash-escaped
// character outside quotes (`\{`, `\*`, …) is inert — bash's own escape
// already neutralizes it — so it is skipped as a pair, not inspected.
function hasUnquotedExpansionChar(raw) {
  const text = String(raw);
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === quote) { quote = null; i++; continue; }
      if (quote === '"' && c === '\\' && i + 1 < text.length) { i += 2; continue; }
      i++;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; i++; continue; }
    if (c === '\\' && i + 1 < text.length) { i += 2; continue; }
    if (UNQUOTED_EXPANSION_CHARS.test(c)) return true;
    i++;
  }
  return false;
}

// Fix round 3, Rule 1: a word is LITERAL — safe to trust as-is, including a
// bare/positional word this hook would otherwise never inspect — only when
// it carries no unresolved shell expansion of ANY kind: not dynamic (the
// scanner's own `$(...)`/backtick/bare-`$VAR` tracking), and no unquoted
// brace/glob/tilde character the scanner does not model at all. This is
// intentionally more PERMISSIVE than isFullyQuotedLiteral (which still
// requires a flag's own VALUE to be entirely inside quotes): an ordinary
// unquoted pathspec like `src/file.ts` is common and harmless, so Rule 1
// only cares whether the word could still be transformed by a real shell,
// not whether it happens to be quoted.
function isLiteralWord(word) {
  return !word.dynamic && !hasUnquotedExpansionChar(word.raw);
}

/**
 * Classify word `i` as a message-carrying flag, or return null. Two shapes:
 *   - `separate`: the value is the NEXT word (`-m <v>`, `--message <v>`).
 *   - `inline`: the value is embedded in THIS SAME word, after a literal
 *     prefix (`-m<v>`, `-m"<v>"`, `--message=<v>`). `valueDequoted` is set
 *     only when the whole word is non-dynamic (fully literal); otherwise the
 *     caller must read the value out of `valueRaw` (the raw text after the
 *     prefix) instead, which may or may not be the accepted heredoc shape.
 *
 * Deliberately does NOT handle combined short clusters (`-am`, `-sm`, `-Fm`,
 * …): classifyShortCluster() in analyzeCommitWords does, because which
 * character the cluster is "about" depends on what comes before `m` in the
 * SAME cluster (`-Fm` is `-F` with value `"m"`, not a message flag at all) —
 * a plain regex on the whole word here can't see that ordering.
 */
function messageFlagAt(words, i) {
  const word = words[i];
  const value = word.value;
  const raw = word.raw;

  if (value === '-m' || value === '--message') {
    return { kind: 'separate', valueIndex: i + 1 };
  }
  if (raw.startsWith('--message=')) {
    const prefixLength = '--message='.length;
    return {
      kind: 'inline',
      valueRaw: raw.slice(prefixLength),
      valueDequoted: word.dynamic ? undefined : value.slice(prefixLength)
    };
  }
  if (raw.startsWith('-m') && raw.length > 2 && !raw.startsWith('--')) {
    return {
      kind: 'inline',
      valueRaw: raw.slice(2),
      valueDequoted: word.dynamic ? undefined : value.slice(2)
    };
  }
  return null;
}

/**
 * Read a message flag's value as literal text, or report why it can't be.
 * `word.dynamic` (set by the shell scanner) is the exact signal this needs:
 * true means the token contains a real `$(...)`/backtick substitution
 * outside single quotes — the one case a real shell would NOT treat as
 * literal text. A single-quoted value containing a backtick is `dynamic:
 * false` (single quotes suppress all expansion), so it is read as literal
 * text here, per spec: "a single-quoted value containing a backtick: allowed
 * and validated".
 *
 * @returns {{ok: true, text: string}|{ok: false, reason: string}}
 */
function readFlagValue(words, flag) {
  if (flag.kind === 'separate') {
    const valueWord = words[flag.valueIndex];
    if (!valueWord) return { ok: false, reason: 'message flag with no value' };
    if (isAnsiCQuoted(valueWord.raw)) {
      return { ok: false, reason: "ANSI-C ($'...') quoting is not read literally; use -m '…' or the quoted heredoc form" };
    }
    if (!valueWord.dynamic) {
      if (!isFullyQuotedLiteral(valueWord.raw)) return { ok: false, reason: NOT_FULLY_QUOTED_REASON };
      return { ok: true, text: valueWord.value };
    }
    const heredoc = readHeredocValue(valueWord.raw);
    if (heredoc !== undefined) return { ok: true, text: heredoc };
    return {
      ok: false,
      reason: 'unresolved $(...) or ` substitution outside the accepted heredoc form'
    };
  }

  if (isAnsiCQuoted(flag.valueRaw)) {
    return { ok: false, reason: "ANSI-C ($'...') quoting is not read literally; use -m '…' or the quoted heredoc form" };
  }
  if (flag.valueDequoted !== undefined) {
    if (!isFullyQuotedLiteral(flag.valueRaw)) return { ok: false, reason: NOT_FULLY_QUOTED_REASON };
    return { ok: true, text: flag.valueDequoted };
  }
  const heredoc = readHeredocValue(flag.valueRaw);
  if (heredoc !== undefined) return { ok: true, text: heredoc };
  return {
    ok: false,
    reason: 'unresolved $(...) or ` substitution outside the accepted heredoc form'
  };
}

// Long-form flags whose VALUE sources the commit message from somewhere
// other than a literal -m/--message/heredoc argument this hook can read:
// a file (-F/--file), the commit template (-t/--template), another
// commit's message (-c/--reedit-message, -C/--reuse-message), a fixup/
// squash subject line this hook never sees (--fixup, --squash), or an
// editor the agent can't use (-e/--edit). Advisor review round: these were
// previously only partly covered, so e.g. `--fixup=HEAD -m "feat: ok"` read
// the -m text as the message when the real subject git records is
// `fixup! …`.
const FORBIDDEN_MESSAGE_SOURCE_LONG_FLAGS = new Set([
  '--file', '--template', '--reedit-message', '--reuse-message',
  '--fixup', '--squash', '--edit'
]);
const FORBIDDEN_MESSAGE_SOURCE_LONG_PREFIXES = [
  '--file=', '--template=', '--reedit-message=', '--reuse-message=', '--fixup=', '--squash='
];
// Short-form equivalents that take a SEPARATE next-word value:
// -F (file), -t (template), -c (reedit-message), -C (reuse-message).
const FORBIDDEN_MESSAGE_SOURCE_SHORT_FLAGS = new Set(['-F', '-t', '-c', '-C']);
// -e has no value to consume.
const FORBIDDEN_MESSAGE_SOURCE_FLAG_NO_VALUE = new Set(['-e']);

function forbiddenMessageSourceFlagAt(words, i) {
  const value = words[i].value;
  if (FORBIDDEN_MESSAGE_SOURCE_FLAG_NO_VALUE.has(value)) {
    return { label: value, consumesNext: false };
  }
  if (FORBIDDEN_MESSAGE_SOURCE_LONG_FLAGS.has(value)) {
    return { label: value, consumesNext: true };
  }
  if (FORBIDDEN_MESSAGE_SOURCE_LONG_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { label: value.split('=')[0], consumesNext: false };
  }
  if (FORBIDDEN_MESSAGE_SOURCE_SHORT_FLAGS.has(value)) {
    return { label: value, consumesNext: true };
  }
  return null;
}

// Flags that are safe to walk past unexamined: they neither read nor write
// the commit message, so leaving their content uninspected cannot hide
// attribution or a bad subject. `withSeparateValue` flags consume the next
// word (its content is metadata — author identity, a date, a signing key —
// never the message, so it is consumed but not inspected).
const SAFE_NON_MESSAGE_LONG_FLAGS = new Set([
  '--all', '--signoff', '--quiet', '--verbose', '--no-verify',
  '--allow-empty', '--allow-empty-message', '--no-edit', '--dry-run',
  '--no-gpg-sign', '--no-status', '--status', '--branch', '--no-branch',
  '--porcelain', '--long', '--null', '--untracked-files', '--include',
  '--only', '--pathspec-from-file', '--interactive', '--patch', '--short',
  '--cleanup'
]);
const SAFE_NON_MESSAGE_LONG_PREFIXES = ['--untracked-files=', '--cleanup=', '--pathspec-from-file='];
const SAFE_WITH_SEPARATE_VALUE_LONG_FLAGS = new Set(['--author', '--date']);
const SAFE_WITH_SEPARATE_VALUE_LONG_PREFIXES = ['--author=', '--date='];

function safeNonMessageFlagAt(value) {
  if (SAFE_NON_MESSAGE_LONG_FLAGS.has(value)) return { consumesNext: false };
  if (SAFE_NON_MESSAGE_LONG_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { consumesNext: false };
  }
  if (SAFE_WITH_SEPARATE_VALUE_LONG_FLAGS.has(value)) return { consumesNext: true };
  if (SAFE_WITH_SEPARATE_VALUE_LONG_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return { consumesNext: false };
  }
  // -S/--gpg-sign takes an OPTIONAL value attached to the SAME token
  // (`-Skeyid`, `--gpg-sign=keyid`) or no value at all (bare `-S`,
  // `--gpg-sign`) — never a separate word.
  if (value === '-S' || /^-S./.test(value) || value === '--gpg-sign' || value.startsWith('--gpg-sign=')) {
    return { consumesNext: false };
  }
  return null;
}

// Short option clusters after `commit` (`-am`, `-sm`, `-Fm`, `-aqv`, …),
// classified character by character, left to right, stopping at the first
// VALUE-TAKING character — everything after it in the same cluster is that
// option's inline value, not more flags (this is also how real git parses
// combined short options). `m`, `F` and `t` are each value-taking; `a`, `s`,
// `q`, `v` and `n` are plain boolean flags. Any other character makes the
// whole cluster unrecognized.
const CLUSTER_VALUE_TAKING = { m: 'message', F: 'forbidden', t: 'forbidden' };
const CLUSTER_SAFE_CHARS = new Set(['a', 's', 'q', 'v', 'n']);

// Returns `{ kind, index }`, where `index` is the position WITHIN `body` of
// the value-taking character (`m`/`F`/`t`), or -1 for `safe`/`unknown`. The
// caller needs that index (fix round 2, N5) to tell whether the cluster's
// value is attached in the SAME word (there are characters after it) or
// must come from the next word (there are none).
function classifyShortCluster(body) {
  for (let index = 0; index < body.length; index++) {
    const ch = body[index];
    if (Object.prototype.hasOwnProperty.call(CLUSTER_VALUE_TAKING, ch)) {
      return { kind: CLUSTER_VALUE_TAKING[ch], index };
    }
    if (!CLUSTER_SAFE_CHARS.has(ch)) return { kind: 'unknown', index: -1 };
  }
  return { kind: 'safe', index: -1 };
}

// Fix round 2 (N5): the dequoted-value index of the character right AFTER
// the cluster's value-taking char (`m` in `-am`, `-mfoo`, a whole-word-quoted
// `'-mstyle: bad'`) — `1` for the leading `-`, plus `clusterCharIndex` chars
// of cluster body up to and including the value-taking char. Returns null
// when that is the END of the whole dequoted word (a bare cluster like
// `-am` with nothing attached — the value is the NEXT word, same as a bare
// `-m`).
function clusterInlineValueIndex(word, clusterCharIndex) {
  const valueIndex = 1 + clusterCharIndex + 1;
  return valueIndex < word.value.length ? valueIndex : null;
}

// Maps `valueIndex` (an index into the DEQUOTED `word.value`) to the
// corresponding index into `word.raw`, replaying the same quote-removal the
// vendored scanner itself used to build `.value` from `.raw`, for a
// non-dynamic word (no `$(...)`/backtick — callers only reach this once a
// word is confirmed `!dynamic`). Also returns the quote character still open
// at that exact point (or null), so the caller can re-wrap a trailing slice
// that starts MID-QUOTE (e.g. splitting a whole-word-quoted
// `'-mstyle: bad'` right after the `m`) into its own self-contained,
// independently-checkable quoted span.
function locateValueSplit(raw, valueIndex) {
  let ri = 0;
  let vi = 0;
  let quote = null;
  while (ri < raw.length && vi < valueIndex) {
    const c = raw[ri];
    if (quote === "'") {
      ri++;
      if (c === "'") { quote = null; continue; }
      vi++;
      continue;
    }
    if (quote === '"') {
      if (c === '"') { quote = null; ri++; continue; }
      if (c === '\\' && ri + 1 < raw.length) { ri += 2; vi++; continue; }
      ri++; vi++; continue;
    }
    if (c === "'" || c === '"') { quote = c; ri++; continue; }
    if (c === '\\' && ri + 1 < raw.length) { ri += 2; vi++; continue; }
    ri++; vi++;
  }
  return { index: ri, quote };
}

// Fix round 2 (N5): read a short-flag cluster's INLINE value (attached in
// the same word right after the value-taking character) as literal text —
// the same "every character must be quoted" rule as any other message value
// (N1), applied to just the trailing slice rather than the next word.
function readInlineClusterValue(word, valueIndex) {
  if (isAnsiCQuoted(word.raw)) {
    return { ok: false, reason: "ANSI-C ($'...') quoting is not read literally; use -m '…' or the quoted heredoc form" };
  }
  if (word.dynamic) {
    const heredoc = readHeredocValue(word.raw);
    if (heredoc !== undefined) return { ok: true, text: heredoc };
    return { ok: false, reason: 'unresolved $(...) or ` substitution outside the accepted heredoc form' };
  }
  const split = locateValueSplit(word.raw, valueIndex);
  const trailingRaw = (split.quote || '') + word.raw.slice(split.index);
  if (!isFullyQuotedLiteral(trailingRaw)) return { ok: false, reason: NOT_FULLY_QUOTED_REASON };
  return { ok: true, text: word.value.slice(valueIndex) };
}

const TRAILER_ATTRIBUTION_PATTERN = /^\s*co-authored-by\s*[:=]/i;
const GENERATED_WITH_PATTERN = /generated with/i;

function isAttributionText(text) {
  return TRAILER_ATTRIBUTION_PATTERN.test(text) || GENERATED_WITH_PATTERN.test(text);
}

// Belt and braces (defense in depth): even when word-level parsing above
// finds no issue, scan the commit segment's own raw source text for an
// attribution line. Catches anything the structured parse missed, at the
// cost of a false positive only if this text appears inside a value this
// hook already read and judged safe — which still blocks, the conservative
// direction.
function hasAttributionInRawText(segmentText) {
  return /^\s*co-authored-by\s*[:=]/im.test(segmentText) || GENERATED_WITH_PATTERN.test(segmentText);
}

/**
 * Read a trailer value word as literal text. Unlike a message flag, a
 * trailer never accepts the heredoc exception — it isn't part of this
 * harness's documented commit convention — so any dynamic (unresolved
 * substitution, including ANSI-C `$'...'`) value is simply unreadable.
 */
function readTrailerValue(valueWord) {
  if (!valueWord) return { ok: false, reason: '--trailer with no value' };
  if (/^\$'/.test(valueWord.raw)) {
    return { ok: false, reason: "--trailer value uses ANSI-C ($'...') quoting, not read literally" };
  }
  if (valueWord.dynamic) {
    return { ok: false, reason: '--trailer value carries an unresolved $(...) or ` substitution' };
  }
  // Fix round 2 (N1): same "every character must be quoted" rule as any
  // other message value — a brace-expanded, globbed or tilde-expanded
  // unquoted character here would reach git differently than read.
  if (!isFullyQuotedLiteral(valueWord.raw)) {
    return { ok: false, reason: `--trailer ${NOT_FULLY_QUOTED_REASON}` };
  }
  return { ok: true, text: valueWord.value };
}

/**
 * Analyze one parsed commit segment's words (everything from `commitIndex`
 * onward). Returns the issue strings this segment contributes (empty when
 * clean) and the literal message text actually read, if any. Every `-xxx`
 * word is either recognized (a message flag, a forbidden message source,
 * `--amend`, `--trailer`, or a flag known to be safe to ignore) or treated
 * as `commit-unknown-option` and blocked — per the "never pass unread"
 * principle, nothing after `commit` is silently skipped by default.
 *
 * @param {object[]} words
 * @param {number} commitIndex
 * @param {string} rawSegmentText
 * @returns {{issues: string[], message: string|null}}
 */
function analyzeCommitWords(words, commitIndex, rawSegmentText) {
  const issues = [];
  const messageParts = [];
  let sawMessageFlag = false;
  let blockedReading = false;

  let i = commitIndex + 1;
  while (i < words.length) {
    const word = words[i];
    const value = word.value;

    if (value === '--') break; // remaining words are pathspecs, not options

    if (value === '--amend') {
      issues.push('commit-amend: agents never amend (Anti-drift) — make a new commit instead');
      i++;
      continue;
    }

    if (value === '--trailer' || value.startsWith('--trailer=')) {
      const inline = value.startsWith('--trailer=');
      // Fix round 2 (N1/N3): `raw` must be sliced from `word.raw` (the
      // pre-dequote text, which still carries its quote characters), not
      // from `value` (word.value, already dequoted). Slicing from `value`
      // produced a "raw" with NO quote marks at all, so isFullyQuotedLiteral
      // would reject every non-dynamic inline --trailer= value outright —
      // including a legitimate `--trailer='Co-authored-by: X'` that should
      // be read and flagged as commit-attribution, not unreadable.
      const valueWord = inline
        ? { raw: word.raw.slice('--trailer='.length), dynamic: word.dynamic, value: value.slice('--trailer='.length) }
        : words[i + 1];
      const result = readTrailerValue(valueWord);
      if (!result.ok) {
        issues.push(`commit-message-unreadable: ${result.reason}`);
      } else if (isAttributionText(result.text)) {
        issues.push(`commit-attribution: --trailer "${result.text}"`);
      }
      i += inline ? 1 : 2;
      continue;
    }

    const forbidden = forbiddenMessageSourceFlagAt(words, i);
    if (forbidden) {
      issues.push(`commit-message-source: ${forbidden.label} is not allowed; use -m '…' or the quoted heredoc form`);
      i += forbidden.consumesNext ? 2 : 1;
      continue;
    }

    const flag = messageFlagAt(words, i);
    if (flag) {
      sawMessageFlag = true;
      const result = readFlagValue(words, flag);
      if (!result.ok) {
        issues.push(`commit-message-unreadable: ${result.reason}`);
        blockedReading = true;
      } else {
        messageParts.push(result.text);
      }
      i = flag.kind === 'separate' ? flag.valueIndex + 1 : i + 1;
      continue;
    }

    if (value.startsWith('--')) {
      const safe = safeNonMessageFlagAt(value);
      if (safe) { i += safe.consumesNext ? 2 : 1; continue; }
      issues.push(`commit-unknown-option: ${value} is not a recognized option; use -m '…' or the quoted heredoc form`);
      i++;
      continue;
    }

    if (value.startsWith('-') && value !== '-') {
      const safe = safeNonMessageFlagAt(value);
      if (safe) { i += safe.consumesNext ? 2 : 1; continue; }
      const cluster = classifyShortCluster(value.slice(1));
      if (cluster.kind === 'safe') { i++; continue; }
      if (cluster.kind === 'forbidden') {
        issues.push(`commit-message-source: ${value} is not allowed; use -m '…' or the quoted heredoc form`);
        i++;
        continue;
      }
      if (cluster.kind === 'message') {
        // A combined short cluster ending in `m` (`-am`, `-sm`, `-asm`, …).
        // messageFlagAt does not handle clusters itself (see its own
        // comment) — this is the one place that does, since only this
        // classifier knows the cluster didn't hit a forbidden char (F/t)
        // before reaching `m`.
        //
        // Fix round 2 (N5): the value may be ATTACHED in the SAME word
        // right after `m` (`-am'…'`, a whole-word-quoted `'-mstyle: bad'`)
        // rather than the next word — git reads whatever immediately
        // follows `m` in that word as the value when present. Only a BARE
        // cluster with nothing attached (`-am` alone) falls back to reading
        // the next word, same as a bare `-m`.
        sawMessageFlag = true;
        const inlineValueIndex = clusterInlineValueIndex(word, cluster.index);
        const result = inlineValueIndex === null
          ? readFlagValue(words, { kind: 'separate', valueIndex: i + 1 })
          : readInlineClusterValue(word, inlineValueIndex);
        if (!result.ok) {
          issues.push(`commit-message-unreadable: ${result.reason}`);
          blockedReading = true;
        } else {
          messageParts.push(result.text);
        }
        i += inlineValueIndex === null ? 2 : 1;
        continue;
      }
      issues.push(`commit-unknown-option: ${value} is not a recognized option; use -m '…' or the quoted heredoc form`);
      i++;
      continue;
    }

    // A bare word (no leading '-'): normally a pathspec or similar
    // positional argument, not an option — but fix round 3 (Rule 1) closes
    // the gap where this was true UNCONDITIONALLY: a brace-expansion
    // fragment (`{-m,'Co-authored-by: X'}`) or a bare command substitution/
    // parameter expansion (`$(echo --amend)`, `$EXTRA`) also lands here
    // (neither starts with `-`), and a real shell could turn either into
    // EXTRA words — possibly new flags/values — before git ever runs. Any
    // such word blocks the whole segment as unreadable; a genuinely literal
    // bare word (an ordinary pathspec) is unaffected.
    if (!isLiteralWord(word)) {
      issues.push(
        'commit-message-unreadable: a positional word is not literal (dynamic, or an ' +
        'unquoted brace/glob/tilde character) — a real shell could expand it into ' +
        'additional words, including new flags, before git ever runs'
      );
      blockedReading = true;
    }
    i++;
  }

  if (!sawMessageFlag) {
    issues.push(
      'commit-no-message: no -m/--message flag found; an editor would open, which agents ' +
      "can't use. Use -m '…' or the quoted heredoc form."
    );
  }

  if (hasAttributionInRawText(rawSegmentText) && !issues.some((issue) => issue.startsWith('commit-attribution'))) {
    issues.push('commit-attribution: found in the raw commit segment text');
  }

  const message = !blockedReading && messageParts.length > 0 ? messageParts.join('\n\n') : null;
  return { issues, message };
}

/**
 * Validate every `git ... commit ...` invocation parsed out of `command`
 * against our conventional-commit rules, reusing checkCommitMessage() from
 * .claude/hooks/lib/contracts.mjs (our COMMIT_TYPES, SUBJECT_MAX_CHARS and
 * the Co-Authored-By / "Generated with" attribution ban) as the single
 * source of truth this hook shares with the gate-checker drift guard.
 *
 * @param {string} command
 * @returns {Promise<{message: string|null, issues: string[]}|null>} null when
 *   no `git ... commit ...` invocation is found anywhere in `command` (not a
 *   commit at all — e.g. `grep -m 1 "git commit" CLAUDE.md`). Otherwise an
 *   object whose `issues` is the union of every blocking reason found across
 *   every parsed commit segment (format/attribution from checkCommitMessage,
 *   plus commit-amend / commit-message-source / commit-message-unreadable /
 *   commit-no-message / commit-attribution from the checks above) — any
 *   non-empty `issues` means BLOCK.
 */
async function validateCommitMessage(command) {
  const segments = findCommitSegments(command);
  if (segments.length === 0) return null;

  const { checkCommitMessage } = await import('./lib/contracts.mjs');
  const allIssues = [];
  let firstMessage = null;

  // Fix round 3, Rule 2: a GIT_CONFIG_* environment-variable prefix is the
  // same config-injection technique as an unsafe `-c`, whether set bare, via
  // `env`, or via an earlier `export` elsewhere in this same command text —
  // see hasGitConfigEnvInjection's own comment for why this is a whole-
  // command text scan rather than a per-segment one.
  if (hasGitConfigEnvInjection(command)) {
    allIssues.push(
      'commit-unsafe-config: a GIT_CONFIG_COUNT/KEY_n/VALUE_n/PARAMETERS environment ' +
      'variable is set somewhere in this command; it configures git identically to -c ' +
      'and is not allowed ahead of a commit'
    );
  }

  for (const segment of segments) {
    // Fix round 3, Rule 4/5: an opaque-block marker (an unrecognized
    // wrapper/shell shape whose text mentions "commit") carries no parsed
    // words at all — just block with its own reason.
    if (segment.opaqueBlock) {
      allIssues.push(segment.reason);
      continue;
    }

    // Fix round 2 (N2): a wrapped/recursed segment (bash -c '…', $(...))
    // was tokenized out of its OWN source text, not the outer `command` —
    // slicing from `command` would read the wrong bytes (or throw, or
    // silently read unrelated text at the same offsets).
    const rawSegmentText = segment.sourceText.slice(segment.start, segment.end);
    // Fix round 3, Rule 3: a `-c`/`--config-env` setting whose key is
    // sensitive (trailer./include./includeIf./alias.) or whose key/value is
    // not literal is blocked outright, regardless of what the commit's own
    // message/trailer flags look like.
    for (const setting of segment.unsafeConfigs) {
      allIssues.push(
        `commit-unsafe-config: -c ${setting} is not allowed; a sensitive or non-literal ` +
        'config setting can change how git reads this commit in ways this hook cannot verify'
      );
    }
    // Fix round 3, Rule 2: a leading VAR=value assignment carrying an
    // unresolved substitution is unreadable the same way any other dynamic
    // value is.
    if (segment.hasDynamicAssignment) {
      allIssues.push(
        'commit-message-unreadable: a leading VAR=value assignment carries an unresolved ' +
        '$(...) or ` substitution'
      );
    }
    const { issues, message } = analyzeCommitWords(segment.words, segment.commitIndex, rawSegmentText);
    allIssues.push(...issues);
    if (message !== null) {
      allIssues.push(...checkCommitMessage(message));
      if (firstMessage === null) firstMessage = message;
    }
  }

  return { message: firstMessage, issues: allIssues };
}

function getPathEnv() {
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') || 'PATH';
  return process.env[pathKey] || '';
}

function isPathLike(command) {
  return command.includes(path.sep) || (process.platform === 'win32' && /[\\/]/.test(command));
}

function getExecutableCandidates(command) {
  if (process.platform !== 'win32' || path.extname(command)) {
    return [command];
  }

  const pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  return [command, ...pathExt.split(';').filter(Boolean).map(ext => `${command}${ext.toLowerCase()}`)];
}

function resolveCommand(command) {
  if (isPathLike(command)) {
    return getExecutableCandidates(command).find(candidate => fs.existsSync(candidate)) || null;
  }

  for (const dir of getPathEnv().split(path.delimiter).filter(Boolean)) {
    for (const candidate of getExecutableCandidates(path.join(dir, command))) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

const LINTER_TIMEOUT_MS = 30000;
const UNSAFE_CMD_TOKEN = /["\0\r\n]/;
const CMD_TOKEN_ENV_PREFIX = 'ECC_LINTER_TOKEN_';

function validateCmdToken(value) {
  const token = String(value);
  if (UNSAFE_CMD_TOKEN.test(token)) {
    throw new Error(`Unsafe character in Windows linter argument: ${JSON.stringify(token)}`);
  }
  return token;
}

function getLinterInvocation(command, args, platform = process.platform) {
  const useCmd = platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);

  if (useCmd) {
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) {
      if (name.toUpperCase().startsWith(CMD_TOKEN_ENV_PREFIX)) {
        delete environment[name];
      }
    }

    // Keep untrusted values out of cmd.exe source. Percent expansion is
    // non-recursive, so percent signs introduced by these environment values
    // stay literal. Disabling delayed expansion likewise preserves exclamation
    // marks. Quotes and line controls remain invalid because they could escape
    // the quoted token boundary or create another command line.
    const tokenReferences = [command, ...args].map((value, index) => {
      const name = `${CMD_TOKEN_ENV_PREFIX}${index}`;
      environment[name] = validateCmdToken(value);
      return `"%${name}%"`;
    });
    const commandLine = tokenReferences.join(' ');
    return {
      command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', `"${commandLine}"`],
      options: {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: LINTER_TIMEOUT_MS,
        shell: false,
        windowsVerbatimArguments: true,
        env: environment
      }
    };
  }

  return {
    command,
    args,
    options: {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: LINTER_TIMEOUT_MS,
      shell: false
    }
  };
}

function runLinterCommand(command, args) {
  try {
    const invocation = getLinterInvocation(command, args);
    return spawnSync(invocation.command, invocation.args, { ...invocation.options, shell: false });
  } catch (error) {
    return { status: null, stdout: '', stderr: '', error };
  }
}

function commandOutput(result) {
  return result.stdout || result.stderr || result.error?.message || '';
}

function golintSucceeded(result) {
  return result.status === 0 && !result.error && (!result.stdout || result.stdout.trim() === '');
}

/**
 * Run linter on staged files
 * @param {string[]} files
 * @returns {object} Lint results
 */
function runLinter(files) {
  const jsFiles = files.filter(f => /\.(js|jsx|ts|tsx)$/.test(f));
  const pyFiles = files.filter(f => f.endsWith('.py'));
  const goFiles = files.filter(f => f.endsWith('.go'));

  const results = {
    eslint: null,
    pylint: null,
    golint: null
  };

  // Run ESLint if available
  if (jsFiles.length > 0) {
    const eslintBin = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
    const eslintPath = path.join(process.cwd(), 'node_modules', '.bin', eslintBin);
    if (fs.existsSync(eslintPath)) {
      const result = runLinterCommand(eslintPath, jsFiles);
      results.eslint = {
        success: result.status === 0,
        output: commandOutput(result)
      };
    }
  }

  // Run Pylint if available
  if (pyFiles.length > 0) {
    try {
      const pylintPath = resolveCommand('pylint');
      if (!pylintPath) {
        results.pylint = null;
      } else {
        const result = runLinterCommand(pylintPath, ['--output-format=text', ...pyFiles]);
        results.pylint = {
          success: result.status === 0,
          output: commandOutput(result)
        };
      }
    } catch {
      // Pylint not available
    }
  }

  // Run golint if available
  if (goFiles.length > 0) {
    try {
      const golintPath = resolveCommand('golint');
      if (!golintPath) {
        results.golint = null;
      } else {
        const result = runLinterCommand(golintPath, goFiles);
        results.golint = {
          success: golintSucceeded(result),
          output: commandOutput(result)
        };
      }
    } catch {
      // golint not available
    }
  }

  return results;
}

/**
 * Core logic — exported for direct invocation
 * @param {string} rawInput - Raw JSON string from stdin
 * @returns {Promise<{output:string, exitCode:number}>} Pass-through output and exit code
 */
async function evaluate(rawInput) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (error) {
    // We don't have a `command` to examine at all here — there is nothing
    // for this hook to detect a commit in, so this is the one place that
    // stays fail-open regardless.
    console.error(`[Hook] Error parsing hook input: ${error.message}`);
    return { output: rawInput, exitCode: 0 };
  }

  const command = input?.tool_input?.command || '';

  // Detect a `git ... commit ...` invocation across common wrapping and
  // chaining forms by real parsing (see findCommitSegments), not a
  // substring check — `grep -m 1 "git commit" CLAUDE.md` must never trigger
  // this hook at all. See docs/security/checklist.md for the residual gaps
  // findCommitSegments does not cover. Once a commit IS
  // detected (segments.length > 0, handled inside validateCommitMessage),
  // anything that throws from here on — including this very call, e.g. the
  // dynamic import of contracts.mjs failing — fails CLOSED (exit 2): a
  // parse failure can't prove the command ISN'T a commit, so the
  // conservative read is that it might be. Only a clean, confirmed "no
  // commit anywhere in this command" (the `=== null` branch below) is
  // fail-open.
  let messageValidation;
  try {
    messageValidation = await validateCommitMessage(command);
  } catch (error) {
    console.error(`[Hook] Error while parsing a possible commit: ${error.message}`);
    console.error('[Hook] ERROR: Commit blocked — this command could not be safely parsed.');
    return { output: rawInput, exitCode: 2 };
  }

  if (messageValidation === null) {
    return { output: rawInput, exitCode: 0 };
  }

  try {
    let totalIssues = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Adaptation (controller ruling W1-a): a format, attribution, amend,
    // forbidden-flag or unreadable-value issue here BLOCKS the commit
    // (exit 2) rather than only warning — see docs/security/checklist.md.
    // This must not be gated on stagedFiles.length, or `git commit
    // --allow-empty -m "<bad subject>"` (nothing staged) would sail
    // through the message check entirely.
    if (messageValidation.issues.length > 0) {
      console.error('\nCommit Message Issues:');
      for (const issue of messageValidation.issues) {
        console.error(`  ERROR ${issue}`);
        totalIssues++;
        errorCount++;
      }
    }

    // Get staged files
    const stagedFiles = getStagedFiles();
    let filesToCheck = [];

    if (stagedFiles.length === 0) {
      console.error('[Hook] No staged files found. Use "git add" to stage files first.');
    } else {
      console.error(`[Hook] Checking ${stagedFiles.length} staged file(s)...`);

      // Check each staged file
      filesToCheck = stagedFiles.filter(shouldCheckFile);

      for (const file of filesToCheck) {
        const fileIssues = findFileIssues(file);
        if (fileIssues.length > 0) {
          console.error(`\n[FILE] ${file}`);
          for (const issue of fileIssues) {
            const label = issue.severity === 'error' ? 'ERROR' : issue.severity === 'warning' ? 'WARNING' : 'INFO';
            console.error(`  ${label} Line ${issue.line}: ${issue.message}`);
            totalIssues++;
            if (issue.severity === 'error') errorCount++;
            if (issue.severity === 'warning') warningCount++;
            if (issue.severity === 'info') infoCount++;
          }
        }
      }
    }

    // Run linter (a no-op when filesToCheck is empty: each *Files filter below is empty too)
    const lintResults = runLinter(filesToCheck);

    if (lintResults.eslint && !lintResults.eslint.success) {
      console.error('\nESLint Issues:');
      console.error(lintResults.eslint.output);
      totalIssues++;
      errorCount++;
    }

    if (lintResults.pylint && !lintResults.pylint.success) {
      console.error('\nPylint Issues:');
      console.error(lintResults.pylint.output);
      totalIssues++;
      errorCount++;
    }

    if (lintResults.golint && !lintResults.golint.success) {
      console.error('\ngolint Issues:');
      console.error(lintResults.golint.output);
      totalIssues++;
      errorCount++;
    }

    // Summary. "PASS: All checks passed!" is only ever reached here, after a
    // commit was actually detected and its message actually validated.
    if (totalIssues > 0) {
      console.error(`\nSummary: ${totalIssues} issue(s) found (${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info)`);

      if (errorCount > 0) {
        console.error(
          '\n[Hook] ERROR: Commit blocked. Use a single-quoted -m value (-m \'…\') or the ' +
          'documented heredoc form: -m "$(cat <<\'EOF\'\n…\nEOF\n)"'
        );
        return { output: rawInput, exitCode: 2 };
      }
      console.error('\n[Hook] WARNING: Warnings found. Consider fixing them, but commit is allowed.');
      return { output: rawInput, exitCode: 0 };
    }

    console.error('\n[Hook] PASS: All checks passed!');
    return { output: rawInput, exitCode: 0 };
  } catch (error) {
    // A commit WAS detected (we're past the `=== null` early return above),
    // so an internal bug here must not silently let it pass unread.
    console.error(`[Hook] Error: ${error.message}`);
    console.error('[Hook] ERROR: Commit blocked — an internal error occurred while checking it.');
    return { output: rawInput, exitCode: 2 };
  }
}

async function run(rawInput) {
  const result = await evaluate(rawInput);
  return {
    stdout: result.output,
    exitCode: result.exitCode,
  };
}

// ── stdin entry point ────────────────────────────────────────────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      const remaining = MAX_STDIN - data.length;
      data += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    run(data).then((result) => {
      process.stdout.write(result.stdout);
      process.exit(result.exitCode);
    });
  });
}

module.exports = {
  run,
  evaluate,
  validateCommitMessage,
  findCommitSegments,
  analyzeCommitWords,
  findFileIssues,
  isPlaceholderSecret,
  getLinterInvocation,
  golintSucceeded,
  runLinter
};
