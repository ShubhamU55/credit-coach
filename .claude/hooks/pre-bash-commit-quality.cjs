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

// Matches one -m/--message token and captures its value: a double-quoted
// body (escapes allowed, newlines included — a real `-m "line1\n\nline2"`
// argument carries literal newline bytes, not the two-character sequence
// \n), a single-quoted body, or an unquoted word.
const MESSAGE_TOKEN_PATTERN = /(?:-m|--message)(?:=|\s+)(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"']+))/g;

// This harness's own documented commit convention (see the Bash tool's
// "Committing changes with git" instructions) always wraps the message in a
// heredoc so arbitrary text — quotes, backticks, `$(...)` — survives intact:
//   git commit -m "$(cat <<'EOF'
//   feat: subject
//
//   body
//   EOF
//   )"
// MESSAGE_TOKEN_PATTERN cannot read this: its double-quoted branch would stop
// at the first literal `"` it meets and, finding none before the closing
// `)"`, would capture the ENTIRE wrapper — so the "subject" it sees is the
// opening `$(cat <<'EOF'` line, not the real message. Recognize this exact
// shape first and read the heredoc body as the literal message text.
const HEREDOC_MESSAGE_PATTERN =
  /-m\s+"\$\(\s*cat\s+<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\2[ \t]*\r?\n?\)"/;

function extractHeredocMessage(command) {
  const match = command.match(HEREDOC_MESSAGE_PATTERN);
  return match ? match[3] : undefined;
}

// A `-m`/`--message` value carrying an unresolved `$(...)` or backtick
// substitution we don't specifically recognize (anything other than the
// heredoc form above) cannot be read as literal text without actually
// running a shell. Treat it as unreadable rather than risk blocking a
// legitimate commit on a garbled partial capture: the gate-checker drift
// guard still validates the real, final commit message afterwards.
function containsUnresolvedSubstitution(token) {
  return token.includes('$(') || token.includes('`');
}

/**
 * Extract every -m/--message value from a git commit command, in order.
 * Recognizes the heredoc-wrapped form (see HEREDOC_MESSAGE_PATTERN) as a
 * single message before falling back to the generic quoted/unquoted token
 * scan, since the two forms are never mixed in the same -m flag.
 *
 * `trusted: true` means the heredoc form matched: its quoted delimiter
 * ('EOF') stops the real shell from expanding anything inside the body, so a
 * `$(...)` or backtick there is ordinary literal text (e.g. a commit body
 * quoting a code span), not an unresolved substitution — containsUnresolved-
 * Substitution must not be applied to it. `trusted: false` means the generic
 * scan ran instead, where the same characters inside an actual double-quoted
 * `-m` argument WOULD be expanded by the real shell, so they are genuinely
 * unsafe to read as literal text.
 *
 * @param {string} command
 * @returns {{tokens: string[], trusted: boolean}}
 */
function extractCommitMessageTokens(command) {
  const heredoc = extractHeredocMessage(command);
  if (heredoc !== undefined) return { tokens: [heredoc], trusted: true };

  const tokens = [];
  const pattern = new RegExp(MESSAGE_TOKEN_PATTERN.source, 'g');
  let match;
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return { tokens, trusted: false };
}

/**
 * Validate a git commit command's message(s) against our conventional-commit
 * rules. `git commit` with several -m/--message flags joins them into one
 * message — the first becomes the subject, the rest become body paragraphs
 * separated by a blank line — so the same join happens here before handing
 * the combined message to contracts.mjs's checkCommitMessage(), the single
 * source of truth this hook shares with the gate-checker drift guard.
 *
 * @param {string} command
 * @returns {Promise<{message: string, issues: string[]}|null>} null when the
 *   command carries no -m/--message flag at all (e.g. `git commit --amend`
 *   reusing the previous message, or an editor-authored commit), or when
 *   every -m value found carries an unresolved substitution this hook
 *   cannot safely read as literal text (see containsUnresolvedSubstitution).
 */
async function validateCommitMessage(command) {
  const { tokens, trusted } = extractCommitMessageTokens(command);
  if (tokens.length === 0) return null;

  if (!trusted && tokens.some(containsUnresolvedSubstitution)) {
    console.error(
      '[Hook] Commit message carries an unresolved $(...) or ` substitution outside ' +
      'the recognized heredoc form; skipping the commit-message format check for this ' +
      'commit. The gate-checker drift guard still checks the real commit afterwards.'
    );
    return null;
  }

  const message = tokens.join('\n\n');
  const { checkCommitMessage } = await import('./lib/contracts.mjs');
  const issues = checkCommitMessage(message);
  return { message, issues };
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
  try {
    const input = JSON.parse(rawInput);
    const command = input.tool_input?.command || '';

    // Only run for git commit commands
    if (!command.includes('git commit')) {
      return { output: rawInput, exitCode: 0 };
    }

    // Check if this is an amend (skip checks for amends to avoid blocking)
    if (command.includes('--amend')) {
      return { output: rawInput, exitCode: 0 };
    }

    let totalIssues = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Validate the commit message(s) FIRST, independent of what happens to be
    // staged right now. Adaptation (controller ruling W1-a): a format or
    // attribution issue here BLOCKS the commit (exit 2) rather than only
    // warning — see docs/security/checklist.md. This must not be gated on
    // stagedFiles.length, or `git commit --allow-empty -m "<bad subject>"`
    // (nothing staged) would sail through the message check entirely.
    const messageValidation = await validateCommitMessage(command);
    if (messageValidation && messageValidation.issues.length > 0) {
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

    // Summary
    if (totalIssues > 0) {
      console.error(`\nSummary: ${totalIssues} issue(s) found (${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info)`);

      if (errorCount > 0) {
        console.error('\n[Hook] ERROR: Commit blocked due to critical issues. Fix them before committing.');
        return { output: rawInput, exitCode: 2 };
      } else {
        console.error('\n[Hook] WARNING: Warnings found. Consider fixing them, but commit is allowed.');
      }
    } else {
      console.error('\n[Hook] PASS: All checks passed!');
    }

  } catch (error) {
    console.error(`[Hook] Error: ${error.message}`);
    // Non-blocking on error
  }

  return { output: rawInput, exitCode: 0 };
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
  extractCommitMessageTokens,
  findFileIssues,
  isPlaceholderSecret,
  getLinterInvocation,
  golintSucceeded,
  runLinter
};
