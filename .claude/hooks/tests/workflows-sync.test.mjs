import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_GLOB, extractBlock } from '../lib/pure-block.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const contractsPath = path.join(repoRoot, '.claude/hooks/lib/contracts.mjs');

const FORBIDDEN = ['Date.now(', 'Math.random(', 'new Date()'];

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

describe('workflow scripts stay in sync with contracts.mjs', () => {
  const canonical = extractBlock(fs.readFileSync(contractsPath, 'utf8'), 'contracts');
  const workflows = listWorkflows();

  it('the canonical contracts block is itself free of clock and randomness calls', () => {
    for (const token of FORBIDDEN) expect(canonical).not.toContain(token);
  });

  it('every workflow carries a byte-identical contracts block (vacuous with no workflows)', () => {
    for (const file of workflows) {
      const block = extractBlock(fs.readFileSync(file, 'utf8'), 'contracts');
      expect(block, path.relative(repoRoot, file)).toBe(canonical);
    }
  });

  it('no workflow reads the clock or randomness', () => {
    for (const file of workflows) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of FORBIDDEN) {
        expect(source.includes(token), `${path.relative(repoRoot, file)} uses ${token}`).toBe(
          false,
        );
      }
    }
  });
});
