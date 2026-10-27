import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const policyPath = path.join(repoRoot, 'docs/ai-policy.md');
const read = (file) => fs.readFileSync(file, 'utf8');

const REQUIRED_HEADINGS = [
  'Tools',
  'Plugins and MCP',
  'Data agents may touch',
  'Personal data (DPDP Act)',
  'Dangerous modes',
  'Review',
  'Cadence',
  'Attribution',
  'Licensing',
  'Accounts and retention',
];

describe('docs/ai-policy.md', () => {
  it('exists', () => {
    expect(fs.existsSync(policyPath)).toBe(true);
  });

  it('has every required section, in order', () => {
    const headings = [...read(policyPath).matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]);

    expect(headings).toEqual(REQUIRED_HEADINGS);
  });

  it('links only to files that exist', () => {
    const text = read(policyPath);
    const missing = [...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
      .map((match) => match[1])
      .filter((target) => !/^[a-z]+:/.test(target))
      .filter((target) => !fs.existsSync(path.resolve(path.dirname(policyPath), target)));

    expect(missing).toEqual([]);
  });

  it('names a next review date', () => {
    expect(read(policyPath)).toMatch(/Next review:\s*\d{1,2} [A-Z][a-z]+ 20\d{2}/);
  });
});

describe('CLAUDE.md', () => {
  it('points agents at the AI policy', () => {
    expect(read(path.join(repoRoot, 'CLAUDE.md'))).toContain('docs/ai-policy.md');
  });
});
