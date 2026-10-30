import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const hookPath = path.join(repoRoot, '.githooks/pre-commit');

/**
 * An absolute bash path: the run tests replace PATH with the stub directory, and on POSIX the
 * spawn itself resolves a bare `bash` through that PATH. Git Bash on Windows (the PATH `bash`
 * there can be WSL).
 */
function findBash() {
  if (process.platform !== 'win32') {
    return ['/bin/bash', '/usr/bin/bash'].find((c) => fs.existsSync(c)) ?? null;
  }
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}
const bash = findBash();

// Spawn-based tests get 60 s per describe block: on a loaded machine a shell spawn alone can pass
// the 5 s default (the same rule as ecc-hooks.test.mjs).
const SPAWN_TIMEOUT_MS = 60_000;

describe('git pre-commit secret scan', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('is installed by pnpm install through the root prepare script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

    expect(pkg.scripts.prepare).toBe('git config core.hooksPath .githooks');
  });

  it('is committed executable, so git runs it', () => {
    const result = spawnSync('git', ['ls-files', '--stage', '.githooks/pre-commit'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.stdout).toMatch(/^100755 /);
  });
});

describe.skipIf(!bash)('git pre-commit secret scan (run)', { timeout: SPAWN_TIMEOUT_MS }, () => {
  let stubDir;

  beforeEach(() => {
    stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-'));
  });

  afterEach(() => {
    fs.rmSync(stubDir, { recursive: true, force: true });
  });

  /** A fake gitleaks that logs its arguments and exits with the given code. */
  function stubGitleaks(exitCode) {
    const stub = path.join(stubDir, 'gitleaks');
    fs.writeFileSync(
      stub,
      `#!/bin/sh\necho "$*" > "${stubDir.split(path.sep).join('/')}/args.log"\nexit ${exitCode}\n`,
    );
    fs.chmodSync(stub, 0o755);
  }

  function runHook() {
    return spawnSync(bash, [hookPath.split(path.sep).join('/')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: stubDir },
    });
  }

  it('blocks the commit with an install hint when gitleaks is missing', () => {
    const result = runHook();

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/gitleaks is not installed/);
  });

  it('scans only the staged changes, redacted', () => {
    stubGitleaks(0);

    const result = runHook();

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(stubDir, 'args.log'), 'utf8').trim()).toBe(
      'git --pre-commit --staged --redact --verbose',
    );
  });

  it('blocks the commit when gitleaks finds a secret', () => {
    stubGitleaks(1);

    expect(runHook().status).toBe(1);
  });
});
