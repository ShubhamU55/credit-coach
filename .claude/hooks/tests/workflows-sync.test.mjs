import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_GLOB, extractBlock } from '../lib/pure-block.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const contractsPath = path.join(repoRoot, '.claude/hooks/lib/contracts.mjs');

const ATTRIBUTION = '// Adapted from affaan-m/ECC (MIT) @ 90606c8';

// Clock and randomness reads that throw inside a Workflow script.
const FORBIDDEN = [
  { name: 'Date.now(', pattern: /\bDate\s*\.\s*now\s*\(/ },
  { name: 'Math.random(', pattern: /\bMath\s*\.\s*random\s*\(/ },
  { name: 'argless new Date', pattern: /\bnew\s+Date\b\s*(\(\s*\)|[^(\s])/ },
  { name: 'bare Date()', pattern: /(^|[^.\w$])Date\s*\(\s*\)/ },
];

/** Names of the forbidden clock/randomness reads found in `source`. */
function forbiddenUses(source) {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(({ name }) => name);
}

/** Lists files matching WORKFLOW_GLOB (`<dir>/*<suffix>`), or [] when the dir doesn't exist. */
function listWorkflows() {
  const slash = WORKFLOW_GLOB.lastIndexOf('/');
  const dir = path.join(repoRoot, WORKFLOW_GLOB.slice(0, slash));
  const suffix = WORKFLOW_GLOB.slice(slash + 1).replace(/^\*/, '');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(dir, entry.name));
}

describe('forbiddenUses', () => {
  it.each([
    ['const t = Date.now();', 'Date.now('],
    ['const r = Math.random();', 'Math.random('],
    ['const d = new Date();', 'argless new Date'],
    ['const d = new Date;', 'argless new Date'],
    ['const d = new Date ();', 'argless new Date'],
    ['const s = Date();', 'bare Date()'],
  ])('flags %s', (source, name) => {
    expect(forbiddenUses(source)).toContain(name);
  });

  it.each([
    "const d = new Date('2026-10-21');",
    'const d = new Date (args.today);',
    'const ms = Date.UTC(2026, 9, 21);',
    'const x = new DateTime();',
    'const y = obj.Date();',
    'const z = toDate();',
  ])('allows %s', (source) => {
    expect(forbiddenUses(source)).toEqual([]);
  });
});

describe('workflow scripts stay in sync with contracts.mjs', () => {
  const canonical = extractBlock(fs.readFileSync(contractsPath, 'utf8'), 'contracts');
  const workflows = listWorkflows();

  it('the canonical block carries the ECC attribution and no clock or randomness reads', () => {
    expect(canonical.split('\n')[0]).toBe(ATTRIBUTION);
    expect(forbiddenUses(canonical)).toEqual([]);
  });

  it('every workflow carries a byte-identical contracts block (vacuous with no workflows)', () => {
    for (const file of workflows) {
      const block = extractBlock(fs.readFileSync(file, 'utf8'), 'contracts');
      expect(block, path.relative(repoRoot, file)).toBe(canonical);
    }
  });

  it('no workflow reads the clock or randomness', () => {
    for (const file of workflows) {
      const uses = forbiddenUses(fs.readFileSync(file, 'utf8'));
      expect(uses, path.relative(repoRoot, file)).toEqual([]);
    }
  });
});
