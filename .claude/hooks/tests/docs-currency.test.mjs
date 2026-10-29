import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const namesIn = (dir, extension) =>
  fs
    .readdirSync(path.join(repoRoot, dir))
    .filter((file) => file.endsWith(extension))
    .map((file) => file.slice(0, -extension.length));

// Claude Code built-ins that rules may mention without a file in .claude/commands.
const BUILT_IN_COMMANDS = new Set(['help', 'clear', 'compact', 'init', 'model', 'config']);

describe('rule files describe the setup that exists', () => {
  it('names every agent file in .claude/agents inside rules/agents.md', () => {
    const rules = read('.claude/rules/agents.md');
    const missing = namesIn('.claude/agents', '.md').filter(
      (name) => !new RegExp(`(^|[^a-z-])${name}([^a-z-]|$)`).test(rules),
    );

    expect(missing).toEqual([]);
  });

  it('does not call any agent planned or unbuilt in rules/agents.md', () => {
    const rules = read('.claude/rules/agents.md');

    expect(rules).not.toMatch(/^#+\s.*planned roster/im);
    expect(rules).not.toMatch(/not yet built|planned, not/i);
  });

  it('does not call the pipeline planned or unbuilt in rules/development-workflow.md', () => {
    const workflow = read('.claude/rules/development-workflow.md');

    expect(workflow).not.toMatch(/not yet built|planned, not|^#+\s.*planned/im);
  });

  it('cites only slash commands that exist in .claude/commands', () => {
    const known = new Set([...namesIn('.claude/commands', '.md'), ...BUILT_IN_COMMANDS]);
    const unknown = [];

    for (const file of namesIn('.claude/rules', '.md')) {
      const text = read(`.claude/rules/${file}.md`);
      for (const [, command] of text.matchAll(/`\/([a-z][a-z-]*)`/g)) {
        if (!known.has(command)) unknown.push(`${file}.md: /${command}`);
      }
    }

    expect(unknown).toEqual([]);
  });

  it('keeps typescript.md from naming a missing agent or applying Playwright to mobile', () => {
    const typescript = read('.claude/rules/typescript.md');
    const playwrightLine = typescript.split('\n').find((line) => /Playwright/.test(line));

    expect(typescript).not.toMatch(/e2e-runner/);
    expect(playwrightLine).toMatch(/apps\/admin/);
  });
});

describe('docs/ai-system.md and the security checklist stay current', () => {
  it('does not describe branch protection as still pending in ai-system.md', () => {
    const aiSystem = read('docs/ai-system.md');

    expect(aiSystem).not.toMatch(/Nothing is pushed yet/);
    expect(aiSystem).toContain('Honest limits (as of 29 Oct 2026)');
  });

  it('documents session hygiene and cost in ai-system.md', () => {
    const aiSystem = read('docs/ai-system.md');
    const start = aiSystem.indexOf('## Session hygiene and cost');

    expect(start).toBeGreaterThan(-1);

    const rest = aiSystem.slice(start + 1);
    const next = rest.search(/^## /m);
    const section = next === -1 ? rest : rest.slice(0, next);

    for (const term of ['/clear', '/compact', '/cost']) {
      expect(section).toContain(term);
    }
  });

  it('records the missing sandbox as a known gap', () => {
    expect(read('docs/security/checklist.md')).toMatch(/sandbox/i);
  });
});

describe('.gitignore', () => {
  it('ignores local agent config that must never be committed', () => {
    const ignored = read('.gitignore')
      .split('\n')
      .map((line) => line.trim());

    for (const entry of ['CLAUDE.local.md', '.claude/settings.local.json', '.mcp.json']) {
      expect(ignored).toContain(entry);
    }
  });
});
