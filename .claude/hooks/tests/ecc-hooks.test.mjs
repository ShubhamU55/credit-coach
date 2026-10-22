// Adapted from affaan-m/ECC (MIT) @ 90606c8
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

  it('returns null when the command carries no -m/--message flag', async () => {
    const { validateCommitMessage } = await import(preBashCommitQualityPath);
    const result = await validateCommitMessage('git commit --amend');
    expect(result).toBeNull();
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
  function runProtection(filePath) {
    return spawnSync(process.execPath, [configProtectionScriptPath], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
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
});

describe('config-protection.cjs: no stdin listener attaches on require (module guard)', () => {
  it('exports run() without registering a process.stdin listener as a side effect', async () => {
    const before = process.stdin.listenerCount('data');
    await import(configProtectionPath);
    const after = process.stdin.listenerCount('data');
    expect(after).toBe(before);
  });
});
