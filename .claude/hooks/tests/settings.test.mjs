import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const settingsPath = path.join(repoRoot, '.claude/settings.json');

// Claude Code substitutes this placeholder, and also exports it as an environment variable, so a
// hook resolves its script from the project root whatever the shell's working directory is.
const PROJECT_DIR = '$' + '{CLAUDE_PROJECT_DIR}';
const hookCmd = (script) => `node "${PROJECT_DIR}"/.claude/hooks/${script}`;

function readSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function allHookCommands(settings) {
  return Object.values(settings.hooks ?? {}).flatMap((entries) =>
    entries.flatMap((entry) => (entry.hooks ?? []).map((hook) => hook.command)),
  );
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
  'Bash(rm -rf *)',
  'Bash(git reset --hard *)',
  'Bash(supabase db reset*)',
  // The PowerShell tool is this machine's primary shell; Bash-only rules do not cover it.
  'PowerShell(* | iex*)',
  'PowerShell(* | Invoke-Expression*)',
  'PowerShell(* --no-verify*)',
  'PowerShell(git push --force *)',
  'PowerShell(git push -f *)',
  'PowerShell(git reset --hard *)',
  'PowerShell(Remove-Item * -Recurse*)',
];

const REQUIRED_ASK_RULES = [
  'Bash(git push *)',
  'PowerShell(git push *)',
  'Bash(gh pr merge*)',
  'Bash(GH_TOKEN=* gh pr merge*)',
  'PowerShell(gh pr merge*)',
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

  it('asks before any git push or PR merge, from either shell tool', () => {
    const ask = readSettings().permissions?.ask ?? [];

    for (const rule of REQUIRED_ASK_RULES) {
      expect(ask).toContain(rule);
    }
  });

  it('keeps the existing protect-env and format-on-edit hooks registered', () => {
    const settings = readSettings();
    const preToolUse = settings.hooks?.PreToolUse ?? [];
    const postToolUse = settings.hooks?.PostToolUse ?? [];

    expect(preToolUse.some((entry) => entry.matcher === 'Write|Edit|MultiEdit')).toBe(true);
    expect(
      preToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command === hookCmd('protect-env.mjs')),
      ),
    ).toBe(true);
    expect(
      postToolUse.some((entry) =>
        entry.hooks?.some((h) => h.command === hookCmd('format-on-edit.mjs')),
      ),
    ).toBe(true);
  });

  it('resolves every hook script from the project root, never from the working directory', () => {
    const commands = allHookCommands(readSettings());

    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command, command).toContain(PROJECT_DIR);
    }
  });

  it('registers the stop-gate on Stop', () => {
    const stop = readSettings().hooks?.Stop ?? [];

    expect(
      stop.some((entry) =>
        entry.hooks?.some((h) => h.command === hookCmd('bin/stop-gate.mjs')),
      ),
    ).toBe(true);
  });

  it('keeps local transcripts for 30 days (docs/ai-policy.md, "Accounts and retention")', () => {
    expect(readSettings().cleanupPeriodDays).toBe(30);
  });

  it('exports metrics to the local collector and never exports prompt text', () => {
    const env = readSettings().env ?? {};

    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe('1');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4317');
    expect(env).not.toHaveProperty('OTEL_LOG_USER_PROMPTS');
  });
});

describe('apps/mobile/.claude/settings.json', () => {
  it('asks before every call to the remote Expo MCP server', () => {
    const mobile = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/mobile/.claude/settings.json'), 'utf8'));

    expect(mobile.permissions?.ask ?? []).toContain('mcp__plugin_expo_expo');
  });
});
