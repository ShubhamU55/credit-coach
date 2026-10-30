#!/usr/bin/env node
// Adapted from affaan-m/ECC (MIT) @ 90606c8
/**
 * Config Protection Hook
 *
 * Blocks modifications to linter/formatter config files, and to this
 * project's own `.claude/settings.json` (an adaptation of upstream ECC:
 * agents must not be able to weaken the hook registrations or permission
 * deny-list that this very file lives in — see docs/security/checklist.md).
 * Agents frequently modify these to make checks pass instead of fixing
 * the actual code. This hook steers the agent back to fixing the source.
 *
 * Exit codes:
 *   0 = allow (not a protected file, or first-time creation of one)
 *   2 = block (existing protected file modification attempted)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;

const PROTECTED_FILES = new Set([
  // ESLint (legacy + v9 flat config, JS/TS/MJS/CJS)
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  // Prettier (all config variants including ESM)
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  // Biome's discovered filenames. Custom --config-path/extends targets need
  // reference context; an arbitrary biome.* basename is not sufficient.
  'biome.json',
  'biome.jsonc',
  '.biome.json',
  '.biome.jsonc',
  // Ruff (Python)
  '.ruff.toml',
  'ruff.toml',
  // Note: pyproject.toml is intentionally NOT included here because it
  // contains project metadata alongside linter config. Blocking all edits
  // to pyproject.toml would prevent legitimate dependency changes.
  // Shell / Style / Markdown
  '.shellcheckrc',
  '.stylelintrc',
  '.stylelintrc.json',
  '.stylelintrc.yml',
  '.stylelintrc.yaml',
  '.stylelintrc.js',
  '.stylelintrc.cjs',
  '.stylelintrc.mjs',
  // Stylelint's current spelling; only the legacy `.stylelintrc*` forms were
  // listed, so a project using the documented `stylelint.config.js` had no
  // protection at all.
  'stylelint.config.js',
  'stylelint.config.cjs',
  'stylelint.config.mjs',
  'stylelint.config.ts',
  'stylelint.config.mts',
  'stylelint.config.cts',
  '.markdownlint.json',
  '.markdownlint.jsonc',
  '.markdownlint.yaml',
  '.markdownlint.yml',
  '.markdownlint.cjs',
  '.markdownlint.mjs',
  '.markdownlintrc',
  // markdownlint-cli2 reads its own config names, not `.markdownlint.*`.
  '.markdownlint-cli2.jsonc',
  '.markdownlint-cli2.yaml',
  '.markdownlint-cli2.cjs',
  '.markdownlint-cli2.mjs',
  // Ignore files are the cheapest way to make a check pass without touching
  // the code OR the config: adding one path to .eslintignore silences the
  // failing file outright. Blocking the config while leaving its ignore list
  // open left the hook's whole purpose one line away from being defeated.
  // First-time creation stays allowed by the same existence check below.
  '.eslintignore',
  '.prettierignore',
  '.stylelintignore',
  '.markdownlintignore',
  'eslint.shared.cjs'
]);

/**
 * Exact basenames only catch a tool's canonical entry point. Real repos split
 * flat config across files: a shared `eslint.config.base.mjs` holding the
 * ignore list and rule severities, imported by per-workspace
 * `eslint.config.mjs` files. That is the common monorepo shape, and matching
 * basenames alone protected the leaves while leaving the trunk -- the file that
 * actually carries the rules -- freely editable.
 *
 * These patterns cover `<tool>.config.<qualifier>.<ext>` and
 * `.<tool>rc.<qualifier>.<ext>` for the linters and formatters listed above.
 * They are case-insensitive for the same reason the Set lookup above is.
 *
 * Deliberately NOT matched: build and test tooling -- `vite.config.ts`,
 * `vitest.config.ts`, `jest.config.js`, `playwright.config.ts`,
 * `tsconfig.json`. This hook exists to stop a LINTER config being weakened in
 * place of fixing the code; editing a bundler or test-runner config is
 * ordinary work, and sweeping those in would make the hook obstructive.
 */
const PROTECTED_PATTERNS = [
  // eslint.config.base.mjs, prettier.config.shared.cjs, stylelint.config.local.js ...
  /^(eslint|prettier|stylelint|commitlint|oxlint)\.config(\.[A-Za-z0-9_-]+)*\.(js|mjs|cjs|ts|mts|cts)$/i,
  // .eslintrc.base.json, .prettierrc.shared.yml ...
  /^\.(eslintrc|prettierrc|stylelintrc|markdownlintrc)(\.[A-Za-z0-9_-]+)*\.(js|cjs|mjs|json|jsonc|yml|yaml|toml)$/i,
];

function isProtectedName(basename) {
  const lower = basename.toLowerCase();
  return PROTECTED_FILES.has(basename)
    || PROTECTED_FILES.has(lower)
    || PROTECTED_PATTERNS.some((re) => re.test(basename));
}

// Adaptation: this project's own hook/permission config also must not be
// weakened by an agent (e.g. deleting a deny-list entry or a hook
// registration so a later edit slips past the other hooks in this file).
// Path-based rather than basename-based, since "settings.json" alone is too
// generic a name to protect everywhere it might appear.
//
// Fix round 1: a plain `endsWith('/.claude/settings.json')` check (string
// comparison on the backslash-normalized raw path) missed every one of:
// a different case (`.claude/Settings.json`, `.CLAUDE/settings.json`), a
// `./`-prefixed or doubled-slash path (`./.claude/./settings.json`,
// `.claude//settings.json`), and relied on luck for `..` segments. `path.
// resolve` is the standard, battle-tested way to collapse `.`/`..`/
// redundant separators on both POSIX and Windows; comparing the resolved,
// slash-normalized, lower-cased form against the repo's own resolved
// `.claude/settings.json` path handles all of those at once, on both
// case-sensitive and case-insensitive filesystems.
//
// PROJECT_ROOT is derived from this file's own location (not process.cwd()),
// so the comparison is correct regardless of which directory a tool happens
// to be invoked from.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function normalizeFilePath(filePath) {
  return path.resolve(String(filePath)).replace(/\\/g, '/').toLowerCase();
}

function resolveProjectPath(...segments) {
  return normalizeFilePath(path.join(PROJECT_ROOT, ...segments));
}

// Advisor review round (fix round 2, second pass): `resolveProjectPath`
// lowercases for the STRING comparison, which is correct there (NTFS is
// case-insensitive), but passing that lowercased string to `fs.statSync`/
// `fs.realpathSync.native` for the IDENTITY fallback would look up the
// wrong, nonexistent path on a case-sensitive filesystem whose repo path
// has uppercase letters. Keep a separate, case-PRESERVING resolved path for
// those `fs` calls.
function resolveProjectPathRaw(...segments) {
  return path.resolve(PROJECT_ROOT, ...segments);
}

// Fix round 2, N6: an NTFS alternate-data-stream suffix (`file::$DATA`, the
// default unnamed stream, or `file:streamname:$DATA`) is a different HANDLE
// on the exact same file content/inode — but it is a different STRING, so
// normalizeFilePath's string comparison never recognized it as the
// protected path. Strip it before any existence/identity check. A
// drive-letter colon (`C:\...`) is never a stream delimiter, so the search
// for `:` starts only after it and after the last path separator — the
// earliest position an ADS colon could legitimately appear.
function stripAlternateDataStream(filePath) {
  const value = String(filePath);
  let searchFrom = /^[A-Za-z]:/.test(value) ? 2 : 0;
  const lastSep = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  if (lastSep + 1 > searchFrom) searchFrom = lastSep + 1;
  const colonIndex = value.indexOf(':', searchFrom);
  return colonIndex === -1 ? value : value.slice(0, colonIndex);
}

// Fix round 2, N6: an 8.3 short name (`SETTIN~1.JSO`) also names the exact
// same file as its long name, but again as a different STRING. Rather than
// trying to resolve what a short name expands to ourselves, compare the
// CANDIDATE path's real on-disk identity (inode/device, with a real-path
// string as a second, independent signal) against the protected path's own
// identity — this works for ANY alias a filesystem recognizes, not just the
// two shapes this round's review found. Only meaningful when the candidate
// names an EXISTING file (a not-yet-created path has no inode to compare —
// the B10 bootstrap case already handled by the existence check elsewhere).
// Fix round 3 (flagged Minor by the round-2 re-review, cheap to fix before
// the merge locks this file): a plain `fs.statSync` returns `ino`/`dev` as
// JS `Number`s, which lose precision above 2^53 — and this volume's own
// guard-script inodes are confirmed to be above that threshold. A precision
// collision there would only ever produce a FALSE POSITIVE (two genuinely
// different files compared as the same), never a missed block, but
// `{ bigint: true }` removes the risk entirely at no extra cost.
function statIdentity(filePath) {
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    return { dev: stat.dev, ino: stat.ino };
  } catch {
    return null;
  }
}

function realPathIdentity(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return null;
  }
}

function sameFileIdentity(candidatePath, protectedPath) {
  const candidateStat = statIdentity(candidatePath);
  const protectedStat = statIdentity(protectedPath);
  if (
    candidateStat &&
    protectedStat &&
    candidateStat.dev === protectedStat.dev &&
    candidateStat.ino === protectedStat.ino
  ) {
    return true;
  }
  const candidateReal = realPathIdentity(candidatePath);
  const protectedReal = realPathIdentity(protectedPath);
  if (candidateReal === null || protectedReal === null) return false;
  return candidateReal.toLowerCase() === protectedReal.toLowerCase();
}

const PROTECTED_SETTINGS_PATH = resolveProjectPath('.claude', 'settings.json');
const PROTECTED_SETTINGS_PATH_RAW = resolveProjectPathRaw('.claude', 'settings.json');
const PROTECTED_SETTINGS_LOCAL_PATH = resolveProjectPath('.claude', 'settings.local.json');
const PROTECTED_SETTINGS_LOCAL_PATH_RAW = resolveProjectPathRaw('.claude', 'settings.local.json');

// Fix round 2, N6: the string match is the cheap first-pass check (and the
// only one possible for a not-yet-created path, which has no inode). When
// `filePath` names an EXISTING file but the string doesn't match, fall back
// to real-identity comparison (using the case-PRESERVING `_RAW` path for
// the actual `fs` calls) — this is what catches an ADS suffix or an 8.3
// short name aliasing the protected path.
function isClaudeSettingsPath(filePath) {
  if (normalizeFilePath(filePath) === PROTECTED_SETTINGS_PATH) return true;
  return protectedFileExists(filePath) && sameFileIdentity(filePath, PROTECTED_SETTINGS_PATH_RAW);
}

// Fix round 1, item 10: `.claude/settings.local.json` is protected
// unconditionally, INCLUDING first-time creation — unlike every other
// protected path, there is no "allow if it doesn't exist yet" escape hatch.
// A personal/local override file is exactly the kind of thing an agent
// could otherwise create fresh to quietly re-enable something `settings.
// json` denies, without ever "modifying an existing" protected file.
function isClaudeSettingsLocalPath(filePath) {
  if (normalizeFilePath(filePath) === PROTECTED_SETTINGS_LOCAL_PATH) return true;
  return (
    protectedFileExists(filePath) &&
    sameFileIdentity(filePath, PROTECTED_SETTINGS_LOCAL_PATH_RAW)
  );
}

// Fix round 1, item 11: the guard scripts that make up this repo's hook
// chain must not be editable by the same agents they are meant to guard —
// otherwise an agent could simply rewrite block-no-verify.cjs (or this very
// file) to stop blocking anything. Deliberately NOT included:
// `.claude/hooks/lib/contracts.mjs` and the rest of `.claude/hooks/**` —
// W2-W4 of this plan must still be able to edit those.
const PROTECTED_GUARD_SCRIPT_RELATIVE_PATHS = [
  'block-no-verify.cjs',
  'pre-bash-commit-quality.cjs',
  'config-protection.cjs',
  'protect-env.mjs',
  path.join('lib', 'shell-scan.cjs')
];
const PROTECTED_GUARD_SCRIPT_PATHS = PROTECTED_GUARD_SCRIPT_RELATIVE_PATHS.map(
  (relativePath) => resolveProjectPath('.claude', 'hooks', relativePath)
);
const PROTECTED_GUARD_SCRIPT_PATHS_RAW = PROTECTED_GUARD_SCRIPT_RELATIVE_PATHS.map(
  (relativePath) => resolveProjectPathRaw('.claude', 'hooks', relativePath)
);

function isProtectedGuardScript(filePath) {
  if (PROTECTED_GUARD_SCRIPT_PATHS.includes(normalizeFilePath(filePath))) return true;
  if (!protectedFileExists(filePath)) return false;
  return PROTECTED_GUARD_SCRIPT_PATHS_RAW.some((protectedPath) =>
    sameFileIdentity(filePath, protectedPath),
  );
}

// CI workflows can weaken every other check at once (drop a job, loosen a
// trigger, widen a token's permissions), so an existing file under
// `.github/workflows/` is protected like a linter config: modifying it is
// blocked, creating a first-time one is allowed. The string match is the first
// pass; the real-path comparison catches aliases such as 8.3 short names.
const PROTECTED_WORKFLOWS_DIR = resolveProjectPath('.github', 'workflows');
const PROTECTED_WORKFLOWS_DIR_RAW = resolveProjectPathRaw('.github', 'workflows');

function isWorkflowFile(filePath) {
  if (normalizeFilePath(filePath).startsWith(`${PROTECTED_WORKFLOWS_DIR}/`)) return true;
  const candidateReal = realPathIdentity(filePath);
  const workflowsReal = realPathIdentity(PROTECTED_WORKFLOWS_DIR_RAW);
  if (candidateReal === null || workflowsReal === null) return false;
  return `${candidateReal.toLowerCase()}${path.sep}`.startsWith(
    `${workflowsReal.toLowerCase()}${path.sep}`,
  );
}

function parseInput(inputOrRaw) {
  if (typeof inputOrRaw === 'string') {
    try {
      return inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {};
    } catch {
      return {};
    }
  }

  return inputOrRaw && typeof inputOrRaw === 'object' ? inputOrRaw : {};
}

// Fail closed on any stat error other than ENOENT. Use lstatSync so a
// symlink at the protected path is treated as present even if its target is
// missing — a dangling symlink still represents an existing config entry
// that an agent should not silently replace. fs.existsSync would swallow
// EACCES/EPERM as false; lstatSync exposes the error code so only a genuine
// "path not found" (ENOENT) is treated as absent.
function protectedFileExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (err) {
    return !(err && err.code === 'ENOENT');
  }
}

// Fix round 4 (Linux CI): the "first-time creation is allowed" escape hatch
// used to check only the CANDIDATE path. A case variant such as
// `.claude/Settings.json` matches the protected path case-insensitively, and
// on a case-insensitive filesystem it also exists (it IS settings.json), so
// it was blocked. On a case-sensitive filesystem (Linux) the variant is a
// distinct, absent path, so the hook returned exit 0. A case variant is not
// a bootstrap: block it whenever the canonical protected file exists too.
function protectedTargetExists(filePath, canonicalPath) {
  return protectedFileExists(filePath) || protectedFileExists(canonicalPath);
}

function matchingGuardScriptPath(filePath) {
  const index = PROTECTED_GUARD_SCRIPT_PATHS.indexOf(normalizeFilePath(filePath));
  return index === -1 ? filePath : PROTECTED_GUARD_SCRIPT_PATHS_RAW[index];
}

function blockResult(message) {
  return { exitCode: 2, stderr: message };
}

// The files that steer the agents: the instruction files and the agent, rule, skill, command and
// workflow definitions. An agent may propose an edit to them (`/retro` applies owner-approved
// prompt edits), but each one stops for the owner's approval instead of going through silently.
const INSTRUCTION_FILES = [
  resolveProjectPath('CLAUDE.md'),
  resolveProjectPath('AGENTS.md'),
];
const INSTRUCTION_DIRS = ['agents', 'rules', 'skills', 'commands', 'workflows'].map(
  (dir) => `${resolveProjectPath('.claude', dir)}/`,
);
const NESTED_INSTRUCTION_FILE = /\/apps\/[^/]+\/(claude|agents)\.md$/;

function isInstructionPath(filePath) {
  const normalized = normalizeFilePath(filePath);
  if (INSTRUCTION_FILES.includes(normalized)) return true;
  if (INSTRUCTION_DIRS.some((dir) => normalized.startsWith(dir))) return true;
  const root = `${resolveProjectPath()}/`;
  return normalized.startsWith(root) && NESTED_INSTRUCTION_FILE.test(`/${normalized.slice(root.length)}`);
}

function askResult(reason) {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }),
  };
}

/**
 * Exportable run() for in-process execution via run-with-flags.js.
 * Avoids the ~50-100ms spawnSync overhead when available.
 */
function run(inputOrRaw, options = {}) {
  if (options.truncated) {
    return {
      exitCode: 2,
      stderr:
        `BLOCKED: Hook input exceeded ${options.maxStdin || MAX_STDIN} bytes. ` +
        'Refusing to bypass config-protection on a truncated payload. ' +
        'Retry with a smaller edit or disable the config-protection hook temporarily.'
    };
  }

  const input = parseInput(inputOrRaw);
  const rawFilePath = input?.tool_input?.file_path || input?.tool_input?.file || '';
  if (!rawFilePath) return { exitCode: 0 };
  // Fix round 2, N6: strip a trailing NTFS alternate-data-stream suffix
  // once, up front, so every check below (string match, basename, identity
  // comparison) operates on the real file path. Stripping is a no-op for an
  // ordinary path without a stream suffix.
  const filePath = stripAlternateDataStream(rawFilePath);

  if (isClaudeSettingsPath(filePath)) {
    if (!protectedTargetExists(filePath, PROTECTED_SETTINGS_PATH_RAW)) return { exitCode: 0 };
    return blockResult(
      'BLOCKED: Modifying .claude/settings.json via Write/Edit/MultiEdit is not allowed. ' +
      'It carries this repo\'s hook registrations and permission deny-list; weakening it ' +
      'defeats every other guard hook. If this is a legitimate settings change, disable ' +
      'the config-protection hook temporarily.'
    );
  }

  if (isClaudeSettingsLocalPath(filePath)) {
    // No existence check: a BRAND-NEW .claude/settings.local.json is blocked
    // too (item 10) — unlike every other protected path, there is no
    // legitimate "bootstrap a fresh config" case for this one.
    return blockResult(
      'BLOCKED: Creating or modifying .claude/settings.local.json via Write/Edit/MultiEdit ' +
      'is not allowed, including first-time creation. A local settings override is exactly ' +
      'the kind of file an agent could use to quietly re-enable something settings.json ' +
      'denies. If this is a legitimate local-settings change, disable the config-protection ' +
      'hook temporarily.'
    );
  }

  if (isProtectedGuardScript(filePath)) {
    if (!protectedTargetExists(filePath, matchingGuardScriptPath(filePath))) return { exitCode: 0 };
    return blockResult(
      `BLOCKED: Modifying ${path.basename(filePath)} via Write/Edit/MultiEdit is not allowed. ` +
      'It is one of this repo\'s guard-hook scripts; an agent weakening its own guard defeats ' +
      'the purpose of every hook in this chain. If this is a legitimate change to the guard ' +
      'itself (e.g. a planned fix-round task), disable the config-protection hook temporarily.'
    );
  }

  if (isWorkflowFile(filePath)) {
    if (!protectedFileExists(filePath)) return { exitCode: 0 };
    return blockResult(
      `BLOCKED: Modifying ${path.basename(filePath)} under .github/workflows is not allowed. ` +
      'A CI workflow can weaken every other check at once; fix the code the check reports ' +
      'instead. If this is a legitimate workflow change, disable the config-protection hook ' +
      'temporarily.'
    );
  }

  if (isInstructionPath(filePath)) {
    return askResult(
      `${path.basename(filePath)} steers every agent session (CLAUDE.md, AGENTS.md or a file under ` +
      '.claude/{agents,rules,skills,commands,workflows}). The owner approves each edit to it ' +
      '(docs/ai-policy.md).'
    );
  }

  const basename = path.basename(filePath);
  // Match case-insensitively. Every PROTECTED_FILES entry is lowercase, and on
  // case-insensitive filesystems (macOS APFS/HFS+, Windows NTFS) a write to
  // `.ESLINTRC.JS` lands on the very same inode as `.eslintrc.js`. A
  // case-sensitive Set lookup therefore let a single case-variant Write
  // silently overwrite the real config while the guard returned exit 0.
  // On genuinely case-sensitive filesystems this only costs a false positive
  // on a distinct file that differs from a protected name by case alone.
  if (isProtectedName(basename)) {
    // Allow first-time creation — there's no existing config to weaken.
    // The hook's purpose is blocking modifications; writing a brand-new
    // config file in a project that has none is a legitimate bootstrap
    // path (e.g. scaffolding ESLint into a fresh repo).
    if (!protectedFileExists(filePath)) return { exitCode: 0 };

    return blockResult(
      `BLOCKED: Modifying ${basename} is not allowed. ` +
      'Fix the source code to satisfy linter/formatter rules instead of ' +
      'weakening the config. If this is a legitimate config change, ' +
      'disable the config-protection hook temporarily.'
    );
  }

  return { exitCode: 0 };
}

module.exports = { run };

// Stdin fallback for spawnSync execution. Adaptation: guarded so that
// `require('./config-protection.cjs')` (e.g. from a test, or in-process via
// run-with-flags.js) never attaches a process.stdin listener as a side
// effect of loading the module — only running this file directly does.
if (require.main === module) {
  let raw = '';
  let truncated = /^(1|true|yes)$/i.test(String(process.env.ECC_HOOK_INPUT_TRUNCATED || ''));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
      if (chunk.length > remaining) truncated = true;
    } else {
      truncated = true;
    }
  });

  process.stdin.on('end', () => {
    const result = run(raw, {
      truncated,
      maxStdin: Number(process.env.ECC_HOOK_INPUT_MAX_BYTES) || MAX_STDIN
    });

    if (result.stderr) {
      process.stderr.write(result.stderr + '\n');
    }

    if (result.exitCode === 2) {
      process.exit(2);
    }

    process.stdout.write(result.stdout ?? raw);
  });
}
