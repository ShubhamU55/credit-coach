import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const settingsPath = path.join(repoRoot, '.claude/settings.json');

function readSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function commandsFor(entries, matcher) {
  const entry = (entries || []).find((e) => e.matcher === matcher);
  return (entry?.hooks ?? []).map((h) => h.command);
}

describe('.claude/settings.json: W1-4 ECC guard hook registrations', () => {
  it('registers block-no-verify and pre-bash-commit-quality on PreToolUse Bash', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, 'Bash');

    expect(commands).toContain('node .claude/hooks/block-no-verify.cjs');
    expect(commands).toContain('node .claude/hooks/pre-bash-commit-quality.cjs');
  });

  it('registers config-protection last on PreToolUse Write|Edit|MultiEdit', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, 'Write|Edit|MultiEdit');

    expect(commands).toContain('node .claude/hooks/config-protection.cjs');
    expect(commands[commands.length - 1]).toBe('node .claude/hooks/config-protection.cjs');
  });

  it('keeps protect-env registered ahead of config-protection on the same matcher', () => {
    const settings = readSettings();
    const commands = commandsFor(settings.hooks?.PreToolUse, 'Write|Edit|MultiEdit');
    const protectEnvIndex = commands.indexOf('node .claude/hooks/protect-env.mjs');
    const configProtectionIndex = commands.indexOf('node .claude/hooks/config-protection.cjs');

    expect(protectEnvIndex).toBeGreaterThanOrEqual(0);
    expect(configProtectionIndex).toBeGreaterThan(protectEnvIndex);
  });
});
