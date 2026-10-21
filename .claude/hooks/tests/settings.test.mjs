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

const REQUIRED_DENY_RULES = [
  'Read(**/.env)',
  'Read(**/.env.local)',
  'Read(**/.env.*.local)',
  'Read(**/.env.production)',
  'Read(**/.env.development)',
  'Read(**/.env.staging)',
  'Read(**/.env.test)',
  'Read(~/.ssh/**)',
  'Read(~/.aws/**)',
  'Bash(curl * | sh*)',
  'Bash(curl * | bash*)',
  'Bash(wget * | sh*)',
  'Bash(wget * | bash*)',
  'Bash(* --no-verify*)',
  'Bash(git push --force*)',
  'Bash(git push -f*)',
];

describe('.claude/settings.json baseline', () => {
  it('denies reading .env files and credential directories, and dangerous shell patterns', () => {
    const settings = readSettings();
    const deny = settings.permissions?.deny ?? [];

    for (const rule of REQUIRED_DENY_RULES) {
      expect(deny).toContain(rule);
    }
  });

  it('disables the legacy co-authored-by byline', () => {
    const settings = readSettings();
    expect(settings.includeCoAuthoredBy).toBe(false);
  });

  it('hides commit and PR attribution via the attribution settings', () => {
    const settings = readSettings();
    expect(settings.attribution?.commit).toBe('');
    expect(settings.attribution?.pr).toBe('');
  });

  it('omits the session link from commits and PRs', () => {
    const settings = readSettings();
    expect(settings.attribution?.sessionUrl).toBe(false);
  });

  it('keeps the existing protect-env and format-on-edit hooks unchanged', () => {
    const settings = readSettings();
    const preToolUse = settings.hooks?.PreToolUse ?? [];
    const postToolUse = settings.hooks?.PostToolUse ?? [];

    expect(preToolUse.some((entry) => entry.matcher === 'Write|Edit|MultiEdit')).toBe(true);
    expect(
      preToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command === 'node .claude/hooks/protect-env.mjs'),
      ),
    ).toBe(true);
    expect(
      postToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command === 'node .claude/hooks/format-on-edit.mjs'),
      ),
    ).toBe(true);
  });
});
