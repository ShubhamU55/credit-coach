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
// Principle: once a `git ... commit` invocation is detected anywhere in the
// command (including after shell chaining, global git options, or an
// environment-variable prefix), either every part of its message is read
// literally and validated, or the commit is BLOCKED (exit 2) with a hint.
// Nothing is ever passed through unread.
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

function skipLeadingAssignments(words) {
  let i = 0;
  while (i < words.length && !words[i].quoted && SHELL_ASSIGNMENT.test(words[i].raw)) i++;
  return i;
}

// git global options that take a separate value word (space-separated:
// `-c key=value`, `-C <dir>`, …). Matches the set block-no-verify.cjs scans
// past for the same reason: so the real subcommand word is found correctly.
const GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE = new Set([
  '-c', '-C', '--config-env', '--work-tree', '--git-dir', '--namespace', '--super-prefix'
]);

// Returns the word index of the subcommand (e.g. `commit`) after `git` and
// any global options, or -1 when `words[start]` is not a git invocation at
// all. Handles space-separated global option values (`-c k=v`, `-C <dir>`)
// and inline forms (`-ck=v`, `--config-env=x`) by simply skipping one word
// per flag when it is not one of the known separate-value options — good
// enough to locate the subcommand; this hook does not need to resolve what
// those options' values actually are the way block-no-verify.cjs does.
function findGitSubcommandIndex(words, start) {
  if (!words[start] || !isGitExecutable(words[start].value)) return -1;
  let index = start + 1;
  while (index < words.length) {
    const value = words[index].value;
    if (!value.startsWith('-')) break;
    if (value === '--') { index++; break; }
    if (GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE.has(value)) { index += 2; continue; }
    index++;
  }
  return index < words.length ? index : -1;
}

/**
 * Parse `command` with the vendored shell scanner and return one entry per
 * top-level parsed command that is a `git ... commit ...` invocation
 * (splitting on `&&`, `||`, `;`, `|` and newlines is scanShell's job, not
 * ours — it already returns one `commands[]` entry per segment). A `grep -m
 * 1 "git commit" CLAUDE.md` never matches: `grep` is not `git`, so this
 * never even looks at its arguments.
 *
 * @param {string} command
 * @returns {{words: object[], commitIndex: number, start: number, end: number}[]}
 */
function findCommitSegments(command) {
  const budget = createBudget(command.length);
  const scan = scanShell(command, budget);
  const segments = [];
  for (const cmd of scan.commands) {
    if (cmd.scopeExit || !cmd.words.length) continue;
    const start = skipLeadingAssignments(cmd.words);
    const subcommandIndex = findGitSubcommandIndex(cmd.words, start);
    if (subcommandIndex === -1) continue;
    const subcommand = cmd.words[subcommandIndex];
    if (subcommand.value !== 'commit') continue;
    segments.push({
      words: cmd.words,
      commitIndex: subcommandIndex,
      start: cmd.words[0].start,
      end: cmd.words[cmd.words.length - 1].end
    });
  }
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
    if (!valueWord.dynamic) return { ok: true, text: valueWord.value };
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
  if (flag.valueDequoted !== undefined) return { ok: true, text: flag.valueDequoted };
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

function classifyShortCluster(body) {
  for (const ch of body) {
    if (Object.prototype.hasOwnProperty.call(CLUSTER_VALUE_TAKING, ch)) {
      return CLUSTER_VALUE_TAKING[ch];
    }
    if (!CLUSTER_SAFE_CHARS.has(ch)) return 'unknown';
  }
  return 'safe';
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
      const valueWord = inline
        ? { raw: value.slice('--trailer='.length), dynamic: word.dynamic, value: value.slice('--trailer='.length) }
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
      if (cluster === 'safe') { i++; continue; }
      if (cluster === 'forbidden') {
        issues.push(`commit-message-source: ${value} is not allowed; use -m '…' or the quoted heredoc form`);
        i++;
        continue;
      }
      if (cluster === 'message') {
        // A combined short cluster ending in `m` (`-am`, `-sm`, `-asm`, …):
        // the value is the NEXT word, same as a bare `-m`. messageFlagAt
        // does not handle clusters itself (see its own comment) — this is
        // the one place that does, since only this classifier knows the
        // cluster didn't hit a forbidden char (F/t) before reaching `m`.
        sawMessageFlag = true;
        const result = readFlagValue(words, { kind: 'separate', valueIndex: i + 1 });
        if (!result.ok) {
          issues.push(`commit-message-unreadable: ${result.reason}`);
          blockedReading = true;
        } else {
          messageParts.push(result.text);
        }
        i += 2;
        continue;
      }
      issues.push(`commit-unknown-option: ${value} is not a recognized option; use -m '…' or the quoted heredoc form`);
      i++;
      continue;
    }

    // A bare word (no leading '-'): a pathspec or similar positional
    // argument, not an option. Not a message, not a threat.
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

  for (const segment of segments) {
    const rawSegmentText = command.slice(segment.start, segment.end);
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

  const command = input.tool_input?.command || '';

  // Detect every `git ... commit ...` invocation by real parsing (see
  // findCommitSegments), not a substring check — `grep -m 1 "git commit"
  // CLAUDE.md` must never trigger this hook at all. Once a commit IS
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
