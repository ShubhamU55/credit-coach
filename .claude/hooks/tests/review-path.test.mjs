import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const OWNER = '@ShubhamU55';
const REQUIRED_OWNED_PATHS = [
  '/CLAUDE.md',
  '/.claude/',
  '/apps/*/AGENTS.md',
  '/apps/*/CLAUDE.md',
  '/apps/mobile/.claude/',
  '/.github/',
  '/docs/ai-policy.md',
];
const TEMPLATE_SECTIONS = ['Summary', 'Test evidence', 'Review checklist', 'AI-assisted'];

// Expands a CODEOWNERS pattern with one `*` path segment to the paths it matches on disk.
function matchesOnDisk(pattern) {
  const segments = pattern.replace(/^\//, '').replace(/\/$/, '').split('/');
  let candidates = [''];
  for (const segment of segments) {
    candidates = candidates.flatMap((base) => {
      const dir = path.join(repoRoot, base);
      if (segment !== '*') {
        return fs.existsSync(path.join(dir, segment)) ? [path.posix.join(base, segment)] : [];
      }
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).map((name) => path.posix.join(base, name));
    });
  }
  return candidates;
}

describe('.github/CODEOWNERS', () => {
  const rules = read('.github/CODEOWNERS')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/));

  it('assigns the owner to every rule', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const [pattern, ...owners] of rules) {
      expect(owners, pattern).toEqual([OWNER]);
    }
  });

  it('covers the agent configuration and the review path itself', () => {
    expect(rules.map(([pattern]) => pattern)).toEqual(REQUIRED_OWNED_PATHS);
  });

  it('only lists paths that exist, so a typo cannot silently drop coverage', () => {
    const dead = rules
      .map(([pattern]) => pattern)
      .filter((pattern) => matchesOnDisk(pattern).length === 0);

    expect(dead).toEqual([]);
  });
});

describe('.github/pull_request_template.md', () => {
  const template = read('.github/pull_request_template.md');

  it('has the agreed sections, in order', () => {
    const headings = [...template.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]);

    expect(headings).toEqual(TEMPLATE_SECTIONS);
  });

  it('carries every item of the code-review checklist, so the two cannot drift apart', () => {
    const checklist = read('.claude/rules/code-review.md')
      .split('## Review Checklist')[1]
      .split('\n## ')[0]
      .split('\n')
      .filter((line) => line.startsWith('- [ ] '))
      .map((line) => line.slice('- [ ] '.length).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));

    expect(checklist.length).toBeGreaterThan(0);
    for (const item of checklist) {
      expect(template, item).toContain(item);
    }
  });

  it('asks for evidence of the checks instead of a bare claim', () => {
    expect(template).toMatch(/pnpm verify/);
  });

  it('does not itself carry an AI attribution line', () => {
    expect(template).not.toMatch(/Co-Authored-By|Generated with/i);
  });
});
