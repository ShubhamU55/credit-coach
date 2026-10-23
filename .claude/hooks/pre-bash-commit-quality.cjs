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

// Commit detection is parse-based: the vendored shell scanner splits the
// command into simple commands (on `&&`, `||`, `;`, `|`, newlines and
// subshells), and each one is classified by a closed 3-tier model:
//
//   Tier 1, a recognized shape, parsed and validated. `git` (after literal
//     `NAME=value` prefixes and the transparent `env`/`command`/`time`/
//     `builtin`/`!`/compound-keyword prefixes), or bash/sh/dash/zsh/ksh
//     with a literal `-c` script, which is re-scanned as its own command
//     text. A correctly parsed git invocation whose subcommand is not
//     `commit` stops here: it is never a candidate.
//   Tier 2, an opaque string. Any other command (except the closed
//     DATA_ONLY_COMMANDS list) whose own text, or the stdin it is fed
//     (heredoc, here-string, or the pipeline feeding it), matches
//     `git … commit` is blocked as unreadable.
//   Tier 3, the fallback net. Any other segment in which a `git` word (or a
//     non-literal word that could become one) is followed by a literal
//     `commit` word is blocked as unreadable.
//
// Once a commit segment is found, every word in it before `--` must be
// literal (isLiteralWord) and its message must be read literally, or the
// commit is BLOCKED (exit 2) with a hint. Nothing is passed through unread.
const { createBudget, scanShell } = require('./lib/shell-scan.cjs');

function basename(value) {
  return value.replace(/\\/g, '/').split('/').pop();
}

// The name all three tiers compare: dequoted, path-stripped, lower-cased
// (Windows resolves command names case-insensitively), `.exe` removed.
function commandName(value) {
  return basename(value).toLowerCase().replace(/\.exe$/, '');
}

function isGitExecutable(value) {
  return commandName(value) === 'git';
}

// A `NAME=value` assignment word, matched on the DEQUOTED text so a quoted
// value (`GIT_AUTHOR_NAME="A B"`) or a whole-word-quoted `env` operand
// (`env "A=b c"`) is still recognized as the literal assignment it is.
const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function skipLeadingAssignments(words, start) {
  let index = start;
  const assignments = [];
  while (index < words.length && SHELL_ASSIGNMENT.test(words[index].value)) {
    assignments.push(words[index]);
    index++;
  }
  return { index, assignments };
}

// Tier 1's transparent prefixes: an unquoted word here runs the rest of the
// segment directly. `then`/`do`/... are how the scanner represents the start
// of a compound command's body once `;`/newline has split it off.
const TRANSPARENT_PREFIX_WORDS = new Set([
  'env', 'command', 'time', 'builtin', '!',
  'if', 'then', 'elif', 'else', 'while', 'until', 'do'
]);

const ENV_BOOLEAN_OPTION = /^-[i0v]+$/;
const ENV_LONG_BOOLEAN_OPTIONS = new Set(['--ignore-environment', '--null', '--debug']);
const ENV_OPTIONS_WITH_SEPARATE_VALUE = new Set(['-u', '--unset', '-C', '--chdir']);
const ENV_OPTION_WITH_ATTACHED_VALUE = /^(?:-[uC].|--unset=|--chdir=)/;
const COMMAND_OPTION = /^-[pvV]+$/;

// How many words one option of a transparent prefix spans (1, or 2 when it
// takes a separate value), or 0 when it is not recognized. Anything not
// recognized, including every `env -S`/`--split-string` spelling, makes the
// prefix opaque, so the segment falls through to Tier 2/3 instead.
function prefixOptionWidth(prefix, value) {
  if (prefix === 'command') return COMMAND_OPTION.test(value) ? 1 : 0;
  if (prefix === 'time') return value === '-p' ? 1 : 0;
  if (value === '-' || ENV_BOOLEAN_OPTION.test(value) || ENV_LONG_BOOLEAN_OPTIONS.has(value)) return 1;
  if (ENV_OPTIONS_WITH_SEPARATE_VALUE.has(value)) return 2;
  return ENV_OPTION_WITH_ATTACHED_VALUE.test(value) ? 1 : 0;
}

// Returns the index after `prefix`'s own options, or -1 when they are not
// fully recognized (an unknown option, or a quoted/non-literal option word).
function skipPrefixOptions(prefix, words, start) {
  if (prefix !== 'env' && prefix !== 'command' && prefix !== 'time') return start;
  let index = start;
  while (index < words.length && words[index].value.startsWith('-')) {
    const word = words[index];
    if (word.quoted || !isLiteralWord(word)) return -1;
    if (word.value === '--') return index + 1;
    const width = prefixOptionWidth(prefix, word.value);
    if (width === 0) return -1;
    if (width === 2 && !(words[index + 1] && isLiteralWord(words[index + 1]))) return -1;
    index += width;
  }
  return index;
}

// Walks literal assignment prefixes and transparent prefixes (with their
// own options) to the real command word. `opaque` means a prefix had an
// option this walk does not model; `assignments` are every assignment word
// walked past (bare prefixes and `env` operands alike).
function unwrapCommandStart(words) {
  let index = 0;
  const assignments = [];
  for (;;) {
    const skipped = skipLeadingAssignments(words, index);
    assignments.push(...skipped.assignments);
    const word = words[skipped.index];
    if (!word || word.quoted || !TRANSPARENT_PREFIX_WORDS.has(word.value)) {
      return { start: skipped.index, opaque: false, assignments };
    }
    const next = skipPrefixOptions(word.value, words, skipped.index + 1);
    if (next === -1) return { start: skipped.index, opaque: true, assignments };
    index = next;
  }
}

// git reads these environment variables the way it reads `-c` (or as a
// whole extra config file), so setting one alongside a commit is config
// injection. Checked on assignment-shaped words only, never on raw text, so
// a message or heredoc body that merely mentions one is not affected.
// Case-insensitive: Windows environment variable names are.
const GIT_CONFIG_ENV_NAME = /^GIT_CONFIG_(?:COUNT|PARAMETERS|GLOBAL|SYSTEM|(?:KEY|VALUE)_\d+)$/i;
const EXPORTING_BUILTINS = new Set(['export', 'declare', 'typeset', 'readonly', 'local']);
const VARIABLE_NAME_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)(?:=|$)/;

function gitConfigEnvName(word) {
  const match = VARIABLE_NAME_PREFIX.exec(word.value);
  return match && GIT_CONFIG_ENV_NAME.test(match[1]) ? match[1] : null;
}

// Records every GIT_CONFIG_* name set by this command's bare assignment
// prefixes, its `env` operands, or (for export/declare/typeset/readonly/
// local) its operands. Recorded across the whole command, since an
// assignment in one segment reaches a commit in a later one.
function recordGitConfigEnv(words, unwrap, context) {
  const candidates = [...unwrap.assignments];
  const head = words[unwrap.start];
  if (head && !head.quoted && EXPORTING_BUILTINS.has(head.value)) {
    candidates.push(...words.slice(unwrap.start + 1));
  }
  for (const word of candidates) {
    const name = gitConfigEnvName(word);
    if (name) context.gitConfigEnv.push(name);
  }
}

// git's global options (git 2.54), so the real subcommand word is found
// correctly. `-c`/`--config-env` are handled separately (their settings are
// checked). Any other option before the subcommand is unrecognized: the walk
// gives up rather than misread its value word as the subcommand.
const GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE = new Set([
  '-C', '--work-tree', '--git-dir', '--namespace', '--super-prefix', '--attr-source',
  '--shallow-file'
]);
const GIT_GLOBAL_FLAGS = new Set([
  '-p', '--paginate', '-P', '--no-pager', '--no-replace-objects', '--no-lazy-fetch',
  '--no-optional-locks', '--no-advice', '--bare', '--literal-pathspecs', '--no-literal-pathspecs',
  '--glob-pathspecs',
  '--noglob-pathspecs', '--icase-pathspecs', '--exec-path', '--html-path', '--man-path',
  '--info-path', '--version', '-v', '--help', '-h'
]);
const GIT_GLOBAL_OPTION_WITH_INLINE_VALUE =
  /^--(?:work-tree|git-dir|namespace|super-prefix|attr-source|exec-path|list-cmds)=/;
const UNRECOGNIZED_GLOBAL_OPTION = -2;

// A `-c`/`--config-env` setting is unsafe when its KEY is in a sensitive
// namespace (trailers can be aliased into attribution text; `include`/
// `includeIf` inject a whole extra config file; `alias` redefines what a
// subcommand means), or when its key or value is not literal (it could
// become anything, including a sensitive key, by the time git reads it).
const UNSAFE_CONFIG_KEY_PATTERN = /^(trailer\.|include\.|includeif\.|alias\.)/i;

function isUnsafeConfigKey(setting) {
  return UNSAFE_CONFIG_KEY_PATTERN.test(String(setting).split('=')[0]);
}

// `settingText` is the DEQUOTED "key=value" text to pattern-match; `word` is
// the word it was read from, used only for the literalness check.
function checkConfigSetting(unsafeConfigs, settingText, word) {
  if (settingText === undefined) return;
  if (!word || !isLiteralWord(word)) { unsafeConfigs.push(settingText); return; }
  if (isUnsafeConfigKey(settingText)) unsafeConfigs.push(settingText);
}

// Returns the word index of the subcommand after `git` and its global
// options, -1 when there is none, or UNRECOGNIZED_GLOBAL_OPTION when an
// option before it is not one git is known to take. Every `-c`/`--config-env` setting
// walked past is checked into `unsafeConfigs` (mutated in place); the caller
// only reads it once `commit` is confirmed.
function findGitSubcommandIndex(words, start, unsafeConfigs) {
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
    if (GIT_GLOBAL_FLAGS.has(value) || GIT_GLOBAL_OPTION_WITH_INLINE_VALUE.test(value)) {
      index++;
      continue;
    }
    return UNRECOGNIZED_GLOBAL_OPTION;
  }
  return index < words.length ? index : -1;
}

const READABLE_FORMS_HINT = "run git directly with -m '…' or the quoted heredoc form";

const OPAQUE_STRING_REASON =
  'commit-message-unreadable: `git … commit` is passed to another program as an opaque ' +
  'string (eval, env -S, a shell fed a dynamic script or stdin, cmd, powershell, an ' +
  `interpreter, …) and cannot be read here; ${READABLE_FORMS_HINT}`;
const UNRECOGNIZED_WRAPPER_REASON =
  'commit-message-unreadable: `git … commit` runs behind a wrapper or command word this ' +
  `hook does not parse; ${READABLE_FORMS_HINT}`;
const NON_LITERAL_SUBCOMMAND_REASON =
  'commit-message-unreadable: the git subcommand word is not literal, so it could expand ' +
  `to commit; ${READABLE_FORMS_HINT}`;

function pushUnreadable(context, reason) {
  context.segments.push({ opaqueBlock: true, reason });
}

// Tier 1, git: a literal `commit` subcommand becomes a segment to validate.
// Any other literal subcommand is not a candidate (no fallthrough to Tier
// 2/3); a non-literal subcommand word (`co{mmit,}`, `$SUB`) is unreadable.
// Returns false only for an unrecognized global option, so the caller falls
// through to Tier 2/3 instead.
function addGitCommitSegment(words, unwrap, text, context) {
  const unsafeConfigs = [];
  const subcommandIndex = findGitSubcommandIndex(words, unwrap.start, unsafeConfigs);
  if (subcommandIndex === UNRECOGNIZED_GLOBAL_OPTION) return false;
  if (subcommandIndex === -1) return true;
  const subcommand = words[subcommandIndex];
  if (!isLiteralWord(subcommand)) {
    pushUnreadable(context, NON_LITERAL_SUBCOMMAND_REASON);
    return true;
  }
  if (subcommand.value !== 'commit') return true;
  context.segments.push({
    words,
    commandStart: unwrap.start,
    commitIndex: subcommandIndex,
    start: words[0].start,
    end: words[words.length - 1].end,
    sourceText: text,
    unsafeConfigs,
    hasDynamicAssignment: unwrap.assignments.some((word) => word.dynamic)
  });
  return true;
}

// Tier 1, shells. Every POSIX shell (git-bash included) runs a `-c` script
// as fresh command text.
const SHELL_NAMES = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh']);
// Boolean single-letter shell options. `o`/`O` each take the NEXT word as
// their argument wherever they sit in a cluster (`-co pipefail`,
// `-oc pipefail`, `-ceo pipefail`); `c` marks a `-c` invocation. Any other
// letter is unrecognized.
const SHELL_BOOLEAN_OPTION_CHARS = new Set([...'euxvilmnpBCEHPT']);
const SHELL_OPTION_CLUSTER = /^[-+][A-Za-z]+$/;
const SHELL_LONG_FLAGS_NO_VALUE = new Set([
  '--noprofile', '--norc', '--posix', '--restricted', '--verbose', '--login'
]);
const SHELL_LONG_FLAGS_WITH_VALUE = new Set(['--rcfile', '--init-file']);

// One shell option word: how many words it spans and whether it sets `-c`,
// or null when it is not recognized.
function shellOption(value) {
  if (SHELL_LONG_FLAGS_NO_VALUE.has(value)) return { width: 1, setsDashC: false };
  if (SHELL_LONG_FLAGS_WITH_VALUE.has(value)) return { width: 2, setsDashC: false };
  if (!SHELL_OPTION_CLUSTER.test(value)) return null;
  let width = 1;
  let setsDashC = false;
  for (const letter of value.slice(1)) {
    if (letter === 'o' || letter === 'O') width++;
    else if (letter === 'c' && value[0] === '-') setsDashC = true;
    else if (!SHELL_BOOLEAN_OPTION_CHARS.has(letter)) return null;
  }
  return { width, setsDashC };
}

// Index of the `-c` script word, or -1 for anything this walk does not
// fully recognize: an unknown option (`-s`, a bare `--`/`-`), a quoted or
// non-literal option word or option argument, or no `-c` at all (a script
// file, or a shell reading stdin).
function findShellScriptIndex(words, start) {
  let index = start + 1;
  let sawDashC = false;
  while (index < words.length && /^[-+]/.test(words[index].value)) {
    const word = words[index];
    if (word.quoted || !isLiteralWord(word)) return -1;
    const option = shellOption(word.value);
    if (!option) return -1;
    for (let k = 1; k < option.width; k++) {
      if (!words[index + k] || !isLiteralWord(words[index + k])) return -1;
    }
    sawDashC = sawDashC || option.setsDashC;
    index += option.width;
  }
  return sawDashC && index < words.length ? index : -1;
}

// Recurses into a literal `-c` script and returns true; returns false (so
// the segment falls through to Tier 2/3) when no literal script was found.
function recurseIntoLiteralShellScript(words, start, budget, context) {
  const scriptIndex = findShellScriptIndex(words, start);
  if (scriptIndex === -1 || !isLiteralWord(words[scriptIndex])) return false;
  collectCommitSegments(words[scriptIndex].value, budget, context);
  return true;
}

// Tier 2/3 exemption: commands that only print, search or copy their
// arguments and stdin, and never execute them. Closed on purpose. Adding a
// name only ever removes a false positive, and a command missing from it
// fails closed, since Tier 2/3 still apply to it.
const DATA_ONLY_COMMANDS = new Set([
  'echo', 'printf', 'cat', 'grep', 'egrep', 'fgrep', 'head', 'tail', 'wc', 'tee', 'gh'
]);
// gh can run a browser, editor or pager command from its environment or
// config, and runs aliases and extensions, so only these subcommands (the
// ones this project's workflow uses to post text) are data-only. Every
// other gh subcommand (`browse`, `config`, `alias`, `extension(s)`, `repo`,
// none at all) falls through to Tier 2/3 like any other command.
const GH_DATA_SUBCOMMANDS = new Set([
  'pr', 'issue', 'api', 'release', 'run', 'workflow', 'label', 'search', 'status'
]);

// A `>(…)` process substitution among a command's words or redirect targets
// runs its output through another command, so that output is no longer
// just data.
function feedsProcessSubstitution(cmd) {
  const words = [...cmd.words, ...cmd.redirects.map((redirect) => redirect.word)];
  return words.some((word) => String(word.raw || '').includes('>('));
}

// A data-only command loses its exemption when it feeds a process
// substitution, or when an assignment prefix or `env` operand in front of it
// carries `git … commit` text (`GH_BROWSER="sh -c '…'" gh pr view --web`:
// the program may run that value as a command).
function isDataOnlyCommand(name, cmd, unwrap) {
  if (!DATA_ONLY_COMMANDS.has(name) || feedsProcessSubstitution(cmd)) return false;
  if (unwrap.assignments.some((word) => GIT_COMMIT_TEXT.test(word.value))) return false;
  if (name !== 'gh') return true;
  const subcommand = cmd.words.slice(unwrap.start + 1).find((word) => !word.value.startsWith('-'));
  return Boolean(subcommand) && GH_DATA_SUBCOMMANDS.has(subcommand.value);
}

// `git` as a word, but not the `.git` directory name (`.git/hooks/pre-commit`
// is a path, not a command), followed anywhere later by `commit`. Tested
// twice: on the text as written, and again with every quote and backslash
// stripped, since quote-splitting inside an opaque string (`g''it commit`,
// `g\it commit`) still runs git once a shell evaluates it.
const GIT_COMMIT_TEXT_RE = /(?<!\.)\bgit\b[\s\S]*\bcommit\b/i;
const GIT_COMMIT_TEXT = {
  test: (text) =>
    GIT_COMMIT_TEXT_RE.test(text) || GIT_COMMIT_TEXT_RE.test(String(text).replace(/['"\\]/g, ''))
};

function commandRawText(words, text) {
  if (!words.length) return '';
  return text.slice(words[0].start, words[words.length - 1].end);
}

// Both spellings of a command for Tier 2: its raw text and its dequoted
// words, so quote-splitting (`g'i't`) can't hide either word.
function commandText(words, text) {
  return `${commandRawText(words, text)}\n${words.map((word) => word.value).join(' ')}`;
}

function heredocBodies(cmd) {
  const bodies = [];
  for (const redirect of cmd.redirects) {
    if (redirect.operator === '<<<') bodies.push(redirect.word.value);
    else if (redirect.operator === '<<' || redirect.operator === '<<-') bodies.push(redirect.body);
  }
  return bodies;
}

function isGitInvocation(cmd) {
  const unwrap = unwrapCommandStart(cmd.words);
  const word = cmd.words[unwrap.start];
  return Boolean(word) && !unwrap.opaque && isLiteralWord(word) && isGitExecutable(word.value);
}

// True when what a command is fed on stdin mentions `git … commit`: its own
// heredoc/here-string bodies, or the text of any command upstream in its
// pipeline. An upstream git invocation is tested one word at a time, so
// `git log --grep=commit | …` stays clean while a word that would print the
// text itself (`git log --format='git commit …' | sh`) does not.
function stdinLooksLikeCommit(cmd, text) {
  const parts = heredocBodies(cmd);
  for (let upstream = cmd.pipeFrom; upstream; upstream = upstream.pipeFrom) {
    if (isGitInvocation(upstream)) parts.push(...upstream.words.map((word) => word.value));
    else parts.push(commandText(upstream.words, text), ...heredocBodies(upstream));
  }
  return parts.some((part) => GIT_COMMIT_TEXT.test(part));
}

// Tier 3: a `git` word, or a non-literal word that could become one,
// followed later in the segment by a literal `commit` word.
function hasGitThenCommitWords(words) {
  let sawGitCandidate = false;
  for (const word of words) {
    if (sawGitCandidate && word.value.toLowerCase() === 'commit') return true;
    if (!isLiteralWord(word) || isGitExecutable(word.value)) sawGitCandidate = true;
  }
  return false;
}

function processCommandForCommitSegments(cmd, text, budget, context) {
  const words = cmd.words;
  const unwrap = unwrapCommandStart(words);
  recordGitConfigEnv(words, unwrap, context);
  const word = words[unwrap.start];
  // An assignment-only segment (`set -a; X=…`, `X=…; export X`) can hand a
  // later command an executable value, so its values are checked too.
  if (!word) {
    if (unwrap.assignments.some((assignment) => GIT_COMMIT_TEXT.test(assignment.value))) {
      pushUnreadable(context, OPAQUE_STRING_REASON);
    }
    return;
  }
  const name = !unwrap.opaque && isLiteralWord(word) ? commandName(word.value) : null;
  if (name === 'git' && addGitCommitSegment(words, unwrap, text, context)) return;
  if (isDataOnlyCommand(name, cmd, unwrap)) return;
  if (SHELL_NAMES.has(name) && recurseIntoLiteralShellScript(words, unwrap.start, budget, context)) {
    if (stdinLooksLikeCommit(cmd, text)) pushUnreadable(context, OPAQUE_STRING_REASON);
    return;
  }
  if (GIT_COMMIT_TEXT.test(commandText(words, text)) || stdinLooksLikeCommit(cmd, text)) {
    pushUnreadable(context, OPAQUE_STRING_REASON);
    return;
  }
  if (hasGitThenCommitWords(words)) pushUnreadable(context, UNRECOGNIZED_WRAPPER_REASON);
}

/**
 * Scan `text` for commit candidates, pushing onto `context.segments` one
 * entry per `git … commit …` invocation (or one opaque-block marker). Also
 * recurses into every `$( … )` command substitution (`cmd.nested`, from
 * the vendored scanner). `budget` is shared across the whole recursive scan
 * so total work stays bounded by the outermost command's length.
 *
 * @param {string} text
 * @param {object} budget
 * @param {{segments: object[], gitConfigEnv: string[]}} context
 */
function collectCommitSegments(text, budget, context) {
  budget.spend(text.length + 1);
  const scan = scanShell(text, budget);
  for (const cmd of scan.commands) {
    if (cmd.scopeExit || !cmd.words.length) continue;
    processCommandForCommitSegments(cmd, text, budget, context);
    for (const nested of cmd.nested) collectCommitSegments(nested, budget, context);
  }
}

function scanForCommits(command) {
  const context = { segments: [], gitConfigEnv: [] };
  collectCommitSegments(command, createBudget(command.length), context);
  return context;
}

/**
 * Every commit candidate found anywhere in `command` (see the 3-tier model
 * above): parsed `git … commit …` segments, and opaque-block markers for
 * Tier 2/3. A `grep -m 1 "git commit" CLAUDE.md` yields none.
 *
 * @param {string} command
 * @returns {object[]}
 */
function findCommitSegments(command) {
  return scanForCommits(command).segments;
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

// A message/trailer VALUE is trusted as literal text only when every
// character of its raw text is quoted or backslash-escaped:
//   - inside '...' (bash expands nothing there);
//   - inside "..." with no active expansion (see hasDoubleQuoteExpansion);
//   - a backslash-escaped character outside quotes, which bash reads as that
//     literal character. This is what keeps the `'don'\''t'` apostrophe
//     idiom literal.
// Any other unquoted character (brace expansion `-m{,}'…'`, a glob, a tilde,
// word splitting) means a real shell could hand git different text than is
// read here, so the value is unreadable. Brace/glob/tilde are inert inside
// "..." in bash, so they are only checked unquoted (hasUnquotedExpansionChar).
function findDoubleQuoteEnd(text, start) {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) { i += 2; continue; }
    if (text[i] === '"') return i;
    i++;
  }
  return -1;
}

// After a `$`, the characters that start a bash expansion inside "...":
// a parameter name or special parameter, `${`, `$(`, `$[`. A `$` followed by
// anything else (a space, the closing quote) is a literal dollar sign.
const DOLLAR_EXPANSION_START = /[A-Za-z0-9_@*#?$!{(\[-]/;

// True when a double-quoted body (the text between the quotes) contains an
// active expansion: an unescaped backtick, or an unescaped `$` that starts
// one. `\$`, `` \` ``, `\"` and `\\` are literal escapes, so a backslash pair
// is skipped whole.
function hasDoubleQuoteExpansion(body) {
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') { i++; continue; }
    if (c === '`') return true;
    if (c === '$' && DOLLAR_EXPANSION_START.test(body[i + 1] || '')) return true;
  }
  return false;
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
      if (close === -1 || hasDoubleQuoteExpansion(text.slice(i + 1, close))) return false;
      i = close + 1;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) { i += 2; continue; }
    return false; // an unquoted character anywhere makes the whole value unreadable
  }
  return true;
}

const NOT_FULLY_QUOTED_REASON =
  'message value is not fully quoted (an unquoted, brace-expanded, globbed or ' +
  "tilde character would reach git differently than read here); use -m '…' or " +
  'the quoted heredoc form';

// Characters that expand only when UNQUOTED: brace expansion and globbing
// anywhere in a word, tilde expansion only at the very start of one
// (`docs/file~1.md` and `HEAD~1` are literal). `$` and backtick are not
// here: the vendored scanner's own `word.dynamic` flag tracks those.
const UNQUOTED_EXPANSION_CHARS = /[{}*?[]/;

// Scans raw word text tracking quote state; true when an expansion
// character appears OUTSIDE any quote, or an ANSI-C `$'…'` / locale `$"…"`
// quote opens (bash rewrites their contents, e.g. `$'\x67it'` is `git`, and
// the vendored scanner does not model that). A backslash-escaped character
// outside quotes (`\{`, `\*`, …) is inert, so it is skipped as a pair.
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
    if (c === '$' && (text[i + 1] === "'" || text[i + 1] === '"')) return true;
    if ((c === '~' && i === 0) || UNQUOTED_EXPANSION_CHARS.test(c)) return true;
    i++;
  }
  return false;
}

// A word is LITERAL (a real shell passes it on unchanged) when it carries
// no unresolved expansion of any kind: not dynamic (the scanner's own
// `$(...)`/backtick/`$VAR` tracking) and no unquoted brace/glob/leading-tilde
// character. More permissive than isFullyQuotedLiteral on purpose: an
// unquoted pathspec like `src/file.ts` is literal, just not quoted.
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

// Index of the first word in [from, to) that is not literal, skipping the
// words a value reader already validated (`exempt`), or -1 when all are.
function firstNonLiteralWordIndex(words, from, to, exempt) {
  for (let index = from; index < Math.min(to, words.length); index++) {
    if (!exempt.has(index) && !isLiteralWord(words[index])) return index;
  }
  return -1;
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
 * Every word from `literalFrom` (the `git` word itself, for a parsed
 * segment) up to the first `--` must also be literal (see
 * firstNonLiteralWordIndex), flag values and global-option values included.
 * Words after `--` are pathspecs only: git reads none of them as an option.
 *
 * @param {object[]} words
 * @param {number} commitIndex
 * @param {string} rawSegmentText
 * @param {number} [literalFrom]
 * @returns {{issues: string[], message: string|null}}
 */
function analyzeCommitWords(words, commitIndex, rawSegmentText, literalFrom = commitIndex) {
  const issues = [];
  const messageParts = [];
  // Words already read by a stricter value reader (message and trailer
  // values, including the accepted heredoc form, which is `dynamic`).
  const valueWords = new Set();
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
      valueWords.add(inline ? i : i + 1);
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
      valueWords.add(flag.kind === 'separate' ? flag.valueIndex : i);
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
        valueWords.add(inlineValueIndex === null ? i + 1 : i);
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

    // A bare word (no leading '-'): a pathspec or similar positional. Its
    // literalness is checked below with every other word.
    i++;
  }

  const nonLiteralIndex = firstNonLiteralWordIndex(words, literalFrom, i, valueWords);
  if (nonLiteralIndex !== -1) {
    issues.push(
      `commit-message-unreadable: ${JSON.stringify(words[nonLiteralIndex].raw)} is not literal ` +
      '(dynamic, or an unquoted brace/glob/leading-tilde character); a real shell could ' +
      'expand it into different or additional words, including new flags, before git runs'
    );
    blockedReading = true;
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
  const { segments, gitConfigEnv } = scanForCommits(command);
  if (segments.length === 0) return null;

  const { checkCommitMessage } = await import('./lib/contracts.mjs');
  const allIssues = [];
  let firstMessage = null;

  // A GIT_CONFIG_* assignment anywhere in this command (bare prefix, `env`
  // operand, or `export`-family operand, in any segment) is the same config
  // injection as an unsafe `-c`. See recordGitConfigEnv.
  if (gitConfigEnv.length > 0) {
    allIssues.push(
      `commit-unsafe-config: ${[...new Set(gitConfigEnv)].join(', ')} is set in this ` +
      'command; git reads it the way it reads -c (or as an extra config file), so it is ' +
      'not allowed alongside a commit'
    );
  }

  for (const segment of segments) {
    // A Tier 2/3 opaque-block marker carries no parsed words: just block
    // with its own reason.
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
    const { issues, message } = analyzeCommitWords(
      segment.words, segment.commitIndex, rawSegmentText, segment.commandStart
    );
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
