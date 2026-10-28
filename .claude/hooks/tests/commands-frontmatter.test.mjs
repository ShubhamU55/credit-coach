import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../lib/agent-lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const commandsDir = path.join(repoRoot, '.claude/commands');
const skillsDir = path.join(repoRoot, '.claude/skills');

const MAX_SKILL_LINES = 500;

// Commands that commit, file issues, or post to GitHub. The owner starts them; the model must not.
// `verify` is deliberately absent: the commit guidance has the model run it before every commit.
const SELF_START_BLOCKED = ['build', 'bug', 'bugfix', 'feature', 'journal', 'pr-review'];

// Commands that run a fixed, read-only set of local commands, so they pre-approve exactly those.
const FIXED_SHELL = ['verify', 'tidy', 'worktrees', 'qa', 'build', 'journal'];

// A pre-approval must never cover a write, an outward call, or a whole tool.
const FORBIDDEN_PRE_APPROVAL =
  /^(Workflow|Agent|Write|Edit|MultiEdit|NotebookEdit)\b|^Bash$|^Bash\(\*\)|^Bash\((git (add|commit|push|merge|rebase|reset|switch|checkout|pull)|gh|rm|mv|curl|wget|sh|bash)(?=[\s)*])/;

const commands = fs
  .readdirSync(commandsDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const text = fs.readFileSync(path.join(commandsDir, file), 'utf8');
    try {
      return { name: file.slice(0, -3), text, meta: parseFrontmatter(text) ?? {}, parseError: null };
    } catch (error) {
      return { name: file.slice(0, -3), text, meta: {}, parseError: error.message.split('\n')[0] };
    }
  });
const byName = (name) => commands.find((command) => command.name === name);

const allowedToolsOf = (meta) => {
  const raw = meta['allowed-tools'];
  const joined = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
  return joined.match(/[A-Za-z][A-Za-z_]*(?:\([^)]*\))?/g) ?? [];
};

describe('.claude/commands frontmatter', () => {
  it('parses as valid YAML with a description for every command', () => {
    const broken = commands
      .filter(({ parseError, meta }) => parseError !== null || typeof meta.description !== 'string')
      .map(({ name, parseError }) => `${name}: ${parseError ?? 'no description'}`);

    expect(broken).toEqual([]);
  });

  it('keeps each description whole: a " #" must not turn the rest into a YAML comment', () => {
    const truncated = commands
      .filter(({ meta }) => typeof meta.description === 'string')
      .filter(({ text, meta }) => {
        const rawLine = text.match(/^description:\s*(.*)$/m)?.[1].trim() ?? '';
        const unquoted = rawLine.replace(/^(['"])([\s\S]*)\1$/, '$2').replaceAll("''", "'");
        return unquoted !== meta.description;
      })
      .map(({ name }) => name);

    expect(truncated).toEqual([]);
  });

  it('tells the reader when to use every command', () => {
    const missing = commands.filter(({ meta }) => !/\bUse (when|after|before)\b/.test(meta.description));

    expect(missing.map(({ name }) => name)).toEqual([]);
  });

  it('blocks the model from starting commands that commit, file issues or post to GitHub', () => {
    for (const name of SELF_START_BLOCKED) {
      expect(byName(name)?.meta['disable-model-invocation'], `${name}`).toBe(true);
    }
  });

  it('leaves verify invocable by the model', () => {
    expect(byName('verify').meta['disable-model-invocation']).not.toBe(true);
  });

  it('forces a decision for any new command that talks to GitHub', () => {
    const undecided = commands
      .filter(({ text }) => text.includes('GH_TOKEN='))
      .map(({ name }) => name)
      .filter((name) => !SELF_START_BLOCKED.includes(name));

    expect(undecided).toEqual([]);
  });

  it('pre-approves the fixed local commands of the read-only commands', () => {
    for (const name of FIXED_SHELL) {
      expect(allowedToolsOf(byName(name).meta).length, `${name} allowed-tools`).toBeGreaterThan(0);
    }
  });

  it('never pre-approves a write, an outward call or a whole tool', () => {
    const offenders = commands.flatMap(({ name, meta }) =>
      allowedToolsOf(meta)
        .filter((tool) => FORBIDDEN_PRE_APPROVAL.test(tool))
        .map((tool) => `${name}: ${tool}`),
    );

    expect(offenders).toEqual([]);
  });
});

describe('.claude/skills', () => {
  const skillFiles = fs
    .readdirSync(skillsDir)
    .map((dir) => path.join(skillsDir, dir, 'SKILL.md'))
    .filter((file) => fs.existsSync(file));

  it(`keeps every SKILL.md at or under ${MAX_SKILL_LINES} lines`, () => {
    const tooLong = skillFiles
      .map((file) => ({ file: path.relative(repoRoot, file), lines: fs.readFileSync(file, 'utf8').split('\n').length }))
      .filter(({ lines }) => lines > MAX_SKILL_LINES)
      .map(({ file, lines }) => `${file}: ${lines}`);

    expect(tooLong).toEqual([]);
  });

  it('pre-approves only the fixed local commands of maestro-android-e2e', () => {
    const meta = parseFrontmatter(fs.readFileSync(path.join(skillsDir, 'maestro-android-e2e/SKILL.md'), 'utf8'));
    const tools = allowedToolsOf(meta);

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.filter((tool) => FORBIDDEN_PRE_APPROVAL.test(tool))).toEqual([]);
  });
});
