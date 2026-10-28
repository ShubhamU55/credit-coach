import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const settingsPath = path.join(repoRoot, '.claude/settings.json');

// Both shell tools must pass through the same guards: PowerShell is this machine's primary shell.
const SHELL_MATCHER = 'Bash|PowerShell';
const PROJECT_DIR = '$' + '{CLAUDE_PROJECT_DIR}';
const hookCmd = (script) => `node "${PROJECT_DIR}"/.claude/hooks/${script}`;

function readSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function commandsFor(entries, matcher) {
  const entry = (entries || []).find((e) => e.matcher === matcher);
  return (entry?.hooks ?? []).map((h) => h.command);
}

describe('.claude/settings.json: W1-4 ECC guard hook registrations', () => {
  it('registers block-no-verify and pre-bash-commit-quality on both shell tools', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, SHELL_MATCHER);

    expect(commands).toContain(hookCmd('block-no-verify.cjs'));
    expect(commands).toContain(hookCmd('pre-bash-commit-quality.cjs'));
  });

  it('registers config-protection last on PreToolUse Write|Edit|MultiEdit', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, 'Write|Edit|MultiEdit');

    expect(commands).toContain(hookCmd('config-protection.cjs'));
    expect(commands[commands.length - 1]).toBe(hookCmd('config-protection.cjs'));
  });

  it('keeps protect-env registered ahead of config-protection on the same matcher', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, 'Write|Edit|MultiEdit');
    const protectEnvIndex = commands.indexOf(hookCmd('protect-env.mjs'));
    const configProtectionIndex = commands.indexOf(hookCmd('config-protection.cjs'));

    expect(protectEnvIndex).toBeGreaterThanOrEqual(0);
    expect(configProtectionIndex).toBeGreaterThan(protectEnvIndex);
  });
});
