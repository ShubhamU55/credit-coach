import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.resolve(here, '..');

// The commit hooks are registered for both shell tools. These pin what they do with a command
// shaped the way the PowerShell tool sends it, since PowerShell is this machine's primary shell.
function runHook(hook, command) {
  const input = JSON.stringify({ tool_name: 'PowerShell', tool_input: { command } });
  return spawnSync(process.execPath, [path.join(hooksDir, hook)], { input, encoding: 'utf8' })
    .status;
}

describe('commit hooks on commands sent by the PowerShell tool', () => {
  it('blocks --no-verify', () => {
    expect(runHook('block-no-verify.cjs', 'git commit --no-verify -m "feat: x"')).toBe(2);
  });

  it('blocks an AI attribution trailer', () => {
    const command = 'git commit -m "feat: x" -m "Co-Authored-By: A"';

    expect(runHook('pre-bash-commit-quality.cjs', command)).toBe(2);
  });

  it('lets a conforming single-line commit through', () => {
    const command = 'git commit -m "feat: ok message"';

    expect(runHook('block-no-verify.cjs', command)).toBe(0);
    expect(runHook('pre-bash-commit-quality.cjs', command)).toBe(0);
  });

  it('fails closed on a PowerShell here-string message, which the hook cannot read', () => {
    const command = "git commit -m @'\nfeat: here string\n'@";

    expect(runHook('pre-bash-commit-quality.cjs', command)).toBe(2);
  });

  it('fails closed on a powershell -Command wrapper around a commit', () => {
    expect(runHook('pre-bash-commit-quality.cjs', 'powershell -Command "git commit -m x"')).toBe(2);
  });

  it('ignores a command that is not a commit', () => {
    expect(runHook('block-no-verify.cjs', 'Get-ChildItem')).toBe(0);
    expect(runHook('pre-bash-commit-quality.cjs', 'Get-ChildItem')).toBe(0);
  });
});
