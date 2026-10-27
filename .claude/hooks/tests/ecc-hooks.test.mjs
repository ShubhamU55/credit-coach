// Adapted from affaan-m/ECC (MIT) @ 90606c8
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.resolve(here, '..');
const repoRoot = path.resolve(hooksDir, '../..');

// Dynamic import() needs a file:// URL for an absolute path on Windows.
const blockNoVerifyPath = pathToFileURL(path.join(hooksDir, 'block-no-verify.cjs')).href;
const preBashCommitQualityPath = pathToFileURL(
  path.join(hooksDir, 'pre-bash-commit-quality.cjs'),
).href;
const configProtectionPath = pathToFileURL(path.join(hooksDir, 'config-protection.cjs')).href;
const configProtectionScriptPath = path.join(hooksDir, 'config-protection.cjs');

describe('block-no-verify.cjs: run()', () => {
  it('blocks a git commit carrying --no-verify (exit 2)', async () => {
    const { run } = await import(blockNoVerifyPath);
    const result = run(JSON.stringify({ tool_input: { command: 'git commit --no-verify -m x' } }));
    expect(result.exitCode).toBe(2);
  });

  it('allows an ordinary git commit (exit 0)', async () => {
    const { run } = await import(blockNoVerifyPath);
    const result = run(JSON.stringify({ tool_input: { command: 'git commit -m x' } }));
    expect(result.exitCode).toBe(0);
  });
});

describe('pre-bash-commit-quality.cjs: validateCommitMessage (reuses contracts.mjs checkCommitMessage)', () => {
  it('flags a Co-Authored-By trailer carried in a multi-line -m message', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit -m "feat: x\n\nCo-Authored-By: A"');
    expect(result).not.toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  it('flags "Generated with" in the body as attribution, not just Co-Authored-By', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit -m "feat: x" -m "Generated with Foo"');
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  it('flags a subject whose type is not one of our conventional types', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit -m "style: x"');
    expect(result).not.toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('accepts a conforming subject with no issues', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit -m "feat(x): add y"');
    expect(result.issues).toEqual([]);
  });

  it('joins multiple -m flags into one message, subject first, body after', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage(
      'git commit -m "feat: x" -m "a longer body paragraph"',
    );
    expect(result.message).toBe('feat: x\n\na longer body paragraph');
    expect(result.issues).toEqual([]);
  });

  it('returns null when the command is not a git commit invocation at all', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git status');
    expect(result).toBeNull();
  });

  // Fix round 1: --amend now BLOCKS (agents never amend), it does not make
  // this hook stand down. See commit-hook.test.mjs for the full matrix.
  it('blocks --amend instead of returning null', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit --amend');
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-amend'))).toBe(true);
  });
});

// This harness's own documented commit convention (the Bash tool's
// "Committing changes with git" instructions) always wraps the message in a
// `-m "$(cat <<'EOF' ... EOF )"` heredoc so arbitrary text survives intact.
// A naive quoted-string regex reads only the opening `$(cat <<'EOF'` line as
// the "subject" here, which is why these are a separate, dedicated suite.
function heredocCommit(message) {
  return `git commit -m "$(cat <<'EOF'\n${message}\nEOF\n)"`;
}

describe('pre-bash-commit-quality.cjs: validateCommitMessage (heredoc-wrapped commits)', () => {
  it('reads the real subject out of a heredoc-wrapped message, not the wrapper', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage(heredocCommit('feat: add the thing'));
    expect(result).not.toBeNull();
    expect(result.message).toBe('feat: add the thing');
    expect(result.issues).toEqual([]);
  });

  it('flags a Co-Authored-By trailer inside a heredoc-wrapped body', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const message = 'feat: add the thing\n\nCo-Authored-By: Someone <someone@example.com>';
    const result = await validateCommitMessage(heredocCommit(message));
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  it('reads a heredoc body containing a literal double-quote in full', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const message = 'feat: add the thing\n\nSee the "quoted" section of the PRD.';
    const result = await validateCommitMessage(heredocCommit(message));
    expect(result.message).toBe(message);
    expect(result.issues).toEqual([]);
  });

  it('reads a heredoc body containing backticks (CommonMark code spans) in full', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const message =
      'fix(ai): reject backtick info strings in fence openers\n\n' +
      'matchFenceMarker accepted a ```backtick``` opener.';
    const result = await validateCommitMessage(heredocCommit(message));
    expect(result.message).toBe(message);
    expect(result.issues).toEqual([]);
  });
});

describe('pre-bash-commit-quality.cjs: evaluate() runs the message check regardless of staged files', () => {
  it('blocks a non-conventional subject even with --allow-empty (nothing staged)', async () => {
    const { evaluate } = await import(preBashCommitQualityPath);
    const rawInput = JSON.stringify({
      tool_input: { command: 'git commit --allow-empty -m "style: bad subject"' },
    });
    const result = await evaluate(rawInput);
    expect(result.exitCode).toBe(2);
  });

  it('blocks a non-conventional heredoc-wrapped subject even with --allow-empty', async () => {
    const { evaluate } = await import(preBashCommitQualityPath);
    const command = `git commit --allow-empty -m "$(cat <<'EOF'\nstyle: bad subject\nEOF\n)"`;
    const rawInput = JSON.stringify({ tool_input: { command } });
    const result = await evaluate(rawInput);
    expect(result.exitCode).toBe(2);
  });
});

describe('config-protection.cjs: spawned stdin fallback', () => {
  function runProtection(filePath, options = {}) {
    return spawnSync(process.execPath, [configProtectionScriptPath], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
  }

  it('blocks editing an existing eslint.config.mjs (exit 2)', () => {
    const existingConfig = path.join(repoRoot, 'eslint.config.mjs');
    expect(fs.existsSync(existingConfig)).toBe(true);
    const result = runProtection(existingConfig);
    expect(result.status).toBe(2);
  });

  it('allows editing an ordinary source file (exit 0)', () => {
    const result = runProtection('src/a.ts');
    expect(result.status).toBe(0);
  });

  it('blocks editing the existing .claude/settings.json (exit 2)', () => {
    const settingsPath = path.join(repoRoot, '.claude/settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const result = runProtection(settingsPath);
    expect(result.status).toBe(2);
  });

  // Fix round 1, item 9: normalize (path.resolve) and compare
  // case-insensitively, so a different case, a `./`-prefixed path, a `..`
  // traversal, or a doubled separator all still resolve to the protected
  // settings.json.
  it.each([
    ['a different case basename', path.join(repoRoot, '.claude', 'Settings.json')],
    ['a different case directory', path.join(repoRoot, '.CLAUDE', 'settings.json')],
    ['all-caps basename', path.join(repoRoot, '.claude', 'SETTINGS.JSON')],
    ['a doubled separator', `${repoRoot.replace(/\\/g, '/')}/.claude//settings.json`],
    [
      'a `..` traversal back to the same file',
      path.join(repoRoot, '.claude', 'nope', '..', 'settings.json'),
    ],
  ])('blocks %s (exit 2)', (_label, variantPath) => {
    const result = runProtection(variantPath);
    expect(result.status).toBe(2);
  });

  it('blocks a relative, `./`-prefixed settings.json path (exit 2)', () => {
    // spawnSync's own `cwd` option, not a global process.chdir(), so this
    // never mutates this test worker's actual working directory.
    const result = runProtection('./.claude/./settings.json', { cwd: repoRoot });
    expect(result.status).toBe(2);
  });

  // Fix round 1, item 10: settings.local.json is blocked unconditionally,
  // including first-time creation. Spawned against a freshly-created,
  // isolated temp directory (its own `.claude/hooks/config-protection.cjs`
  // copy, so PROJECT_ROOT resolves there) rather than this repo's real
  // `.claude/settings.local.json` — Claude Code itself sometimes creates
  // that file for local overrides, so asserting it doesn't exist yet in the
  // real repo would be a flaky precondition unrelated to what this test
  // actually checks.
  it('blocks creating a brand-new .claude/settings.local.json (exit 2)', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'config-protection-test-'));
    try {
      const tempHooksDir = path.join(tempRoot, '.claude', 'hooks');
      fs.mkdirSync(tempHooksDir, { recursive: true });
      const tempScriptPath = path.join(tempHooksDir, 'config-protection.cjs');
      fs.copyFileSync(configProtectionScriptPath, tempScriptPath);

      const localSettingsPath = path.join(tempRoot, '.claude', 'settings.local.json');
      expect(fs.existsSync(localSettingsPath)).toBe(false);

      const result = spawnSync(process.execPath, [tempScriptPath], {
        input: JSON.stringify({ tool_input: { file_path: localSettingsPath } }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  // Fix round 1, item 11: the guard scripts themselves are protected, but
  // lib/contracts.mjs (and the rest of .claude/hooks/**) must stay editable
  // for later plan waves.
  it.each([
    'block-no-verify.cjs',
    'pre-bash-commit-quality.cjs',
    'config-protection.cjs',
    path.join('lib', 'shell-scan.cjs'),
  ])('blocks editing the guard script %s (exit 2)', (relativePath) => {
    const guardPath = path.join(repoRoot, '.claude', 'hooks', relativePath);
    expect(fs.existsSync(guardPath)).toBe(true);
    const result = runProtection(guardPath);
    expect(result.status).toBe(2);
  });

  it('blocks editing the guard script protect-env.mjs (exit 2)', () => {
    const guardPath = path.join(repoRoot, '.claude', 'hooks', 'protect-env.mjs');
    expect(fs.existsSync(guardPath)).toBe(true);
    const result = runProtection(guardPath);
    expect(result.status).toBe(2);
  });

  it('still allows editing lib/contracts.mjs (exit 0)', () => {
    const contractsPath = path.join(repoRoot, '.claude', 'hooks', 'lib', 'contracts.mjs');
    expect(fs.existsSync(contractsPath)).toBe(true);
    const result = runProtection(contractsPath);
    expect(result.status).toBe(0);
  });

  it('still allows editing an unrelated file under .claude/hooks/** (exit 0)', () => {
    const otherHookFile = path.join(repoRoot, '.claude', 'hooks', 'format-on-edit.mjs');
    expect(fs.existsSync(otherHookFile)).toBe(true);
    const result = runProtection(otherHookFile);
    expect(result.status).toBe(0);
  });

  // Fix round 2, N6: an NTFS alternate-data-stream suffix (`::$DATA`) or an
  // 8.3 short name (`SETTIN~1.JSO`) names the SAME underlying file as
  // `settings.json`, but normalizeFilePath's string-only normalization never
  // recognized either as that file. Windows-only (NTFS-specific aliasing);
  // skipped elsewhere since there is no equivalent alias to test.
  (process.platform === 'win32' ? describe : describe.skip)(
    'N6: Windows path-alias bypasses (ADS, 8.3 short names)',
    () => {
      it.each([['an NTFS alternate-data-stream alias of settings.json', '::$DATA']])(
        'blocks %s (exit 2)',
        (_label, suffix) => {
          const settingsPath = path.join(repoRoot, '.claude', 'settings.json');
          expect(fs.existsSync(settingsPath)).toBe(true);
          const result = runProtection(settingsPath + suffix);
          expect(result.status).toBe(2);
        },
      );

      it('blocks the 8.3 short name of settings.json (exit 2)', () => {
        const shortPath = path.join(repoRoot, '.claude', 'SETTIN~1.JSO');
        expect(fs.existsSync(shortPath)).toBe(true);
        const result = runProtection(shortPath);
        expect(result.status).toBe(2);
      });

      it('blocks an NTFS alternate-data-stream alias of config-protection.cjs (exit 2)', () => {
        const guardPath = path.join(repoRoot, '.claude', 'hooks', 'config-protection.cjs');
        expect(fs.existsSync(guardPath)).toBe(true);
        const result = runProtection(guardPath + '::$DATA');
        expect(result.status).toBe(2);
      });

      it('blocks the 8.3 short name of config-protection.cjs (exit 2)', () => {
        const shortPath = path.join(repoRoot, '.claude', 'hooks', 'CONFIG~1.CJS');
        expect(fs.existsSync(shortPath)).toBe(true);
        const result = runProtection(shortPath);
        expect(result.status).toBe(2);
      });
    },
  );
});

// Linux CI regression: the case-variant cases above passed on Windows/macOS
// only because a case-insensitive filesystem reports `.claude/Settings.json`
// as existing (it IS settings.json there). On a case-sensitive filesystem the
// variant is a distinct, absent path, and the hook's "first-time creation is
// allowed" existence check let it through with exit 0. These tests emulate a
// case-sensitive filesystem on ANY host by making `fs.lstatSync` resolve each
// path segment by exact name, so they fail without the fix on every OS.
describe('config-protection.cjs: case variants on a case-sensitive filesystem', () => {
  const requireCjs = createRequire(import.meta.url);

  function enoent(filePath) {
    const error = new Error(`ENOENT: no such file or directory, lstat '${filePath}'`);
    error.code = 'ENOENT';
    return error;
  }

  // Throws ENOENT unless every segment below the root exists with this exact
  // spelling, which is how a case-sensitive filesystem looks a path up.
  function assertExactCaseExists(filePath) {
    const resolved = path.resolve(String(filePath));
    const { root } = path.parse(resolved);
    let current = root;
    for (const segment of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
      if (!fs.readdirSync(current).includes(segment)) throw enoent(filePath);
      current = path.join(current, segment);
    }
  }

  function runCaseSensitive(filePath) {
    const { run } = requireCjs(configProtectionScriptPath);
    const realLstat = fs.lstatSync;
    const lstatSpy = vi.spyOn(fs, 'lstatSync').mockImplementation((target, ...rest) => {
      assertExactCaseExists(target);
      return realLstat(target, ...rest);
    });
    try {
      const result = run(JSON.stringify({ tool_input: { file_path: filePath } }));
      return { result, lstatCalls: lstatSpy.mock.calls.length };
    } finally {
      lstatSpy.mockRestore();
    }
  }

  it('the emulation reports a case variant of settings.json as absent', () => {
    expect(() =>
      assertExactCaseExists(path.join(repoRoot, '.claude', 'settings.json')),
    ).not.toThrow();
    expect(() => assertExactCaseExists(path.join(repoRoot, '.claude', 'Settings.json'))).toThrow(
      /ENOENT/,
    );
  });

  it.each([
    ['a different case basename', path.join(repoRoot, '.claude', 'Settings.json')],
    ['a different case directory', path.join(repoRoot, '.CLAUDE', 'settings.json')],
    ['all-caps basename', path.join(repoRoot, '.claude', 'SETTINGS.JSON')],
    [
      'a different case guard script',
      path.join(repoRoot, '.claude', 'hooks', 'Config-Protection.cjs'),
    ],
  ])(
    'blocks %s even though the variant path itself does not exist (exit 2)',
    (_label, variantPath) => {
      const { result, lstatCalls } = runCaseSensitive(variantPath);
      expect(lstatCalls).toBeGreaterThan(0);
      expect(result.exitCode).toBe(2);
    },
  );

  // The canonical-path check must not remove the bootstrap escape hatch: in a
  // repo with no settings.json yet, creating one (in any case) stays allowed.
  it('still allows first-time creation of settings.json in a repo that has none (exit 0)', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'config-protection-test-'));
    try {
      const tempHooksDir = path.join(tempRoot, '.claude', 'hooks');
      fs.mkdirSync(tempHooksDir, { recursive: true });
      const tempScriptPath = path.join(tempHooksDir, 'config-protection.cjs');
      fs.copyFileSync(configProtectionScriptPath, tempScriptPath);

      for (const name of ['settings.json', 'Settings.json']) {
        const result = spawnSync(process.execPath, [tempScriptPath], {
          input: JSON.stringify({
            tool_input: { file_path: path.join(tempRoot, '.claude', name) },
          }),
          encoding: 'utf8',
        });
        expect(result.status).toBe(0);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('config-protection.cjs: no stdin listener attaches on require (module guard)', () => {
  it('exports run() without registering a process.stdin listener as a side effect', async () => {
    const before = process.stdin.listenerCount('data');
    await import(configProtectionPath);
    const after = process.stdin.listenerCount('data');
    expect(after).toBe(before);
  });
});
