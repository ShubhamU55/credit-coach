import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_GLOB, extractBlock } from '../lib/pure-block.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const contractsPath = path.join(repoRoot, '.claude/hooks/lib/contracts.mjs');

const ATTRIBUTION = '// Adapted from affaan-m/ECC (MIT) @ 90606c8';
const SCRIPT_FILE = /\.(c|m)?js$/i;

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

/**
 * Script files (.js/.mjs/.cjs, at any depth) under `dir` that WORKFLOW_GLOB would not pick up,
 * relative to `dir`. A renamed workflow must fail here rather than silently drop out of the
 * sync and purity checks below. [] when `dir` doesn't exist.
 */
function strayScripts(dir) {
  if (!fs.existsSync(dir)) return [];
  const suffix = WORKFLOW_GLOB.slice(WORKFLOW_GLOB.lastIndexOf('/') + 1).replace(/^\*/, '');
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SCRIPT_FILE.test(entry.name))
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath ?? entry.path, entry.name))
        .split(path.sep)
        .join('/'),
    )
    .filter((rel) => rel.includes('/') || !rel.endsWith(suffix));
}

describe('strayScripts', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflows-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('is empty when the directory does not exist', () => {
    expect(strayScripts(path.join(tmp, 'absent'))).toEqual([]);
  });

  it('accepts *.workflow.js and ignores non-script files', () => {
    fs.writeFileSync(path.join(tmp, 'feature-build.workflow.js'), '');
    fs.writeFileSync(path.join(tmp, 'README.md'), '');
    expect(strayScripts(tmp)).toEqual([]);
  });

  it('reproduces: flags scripts the glob would miss, including in subdirectories', () => {
    fs.writeFileSync(path.join(tmp, 'feature-build.js'), '');
    fs.writeFileSync(path.join(tmp, 'qa.workflow.mjs'), '');
    fs.writeFileSync(path.join(tmp, 'ping.cjs'), '');
    fs.mkdirSync(path.join(tmp, 'old'));
    fs.writeFileSync(path.join(tmp, 'old', 'x.workflow.js'), '');
    expect(strayScripts(tmp).sort()).toEqual([
      'feature-build.js',
      'old/x.workflow.js',
      'ping.cjs',
      'qa.workflow.mjs',
    ]);
  });
});

describe('.claude/workflows has no script outside WORKFLOW_GLOB', () => {
  it('every .js/.mjs/.cjs file there matches the glob (passes when the dir does not exist)', () => {
    const slash = WORKFLOW_GLOB.lastIndexOf('/');
    expect(strayScripts(path.join(repoRoot, WORKFLOW_GLOB.slice(0, slash)))).toEqual([]);
  });
});

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
