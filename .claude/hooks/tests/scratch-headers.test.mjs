import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScratchHeader } from '../lib/scratch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const scratchDir = path.join(repoRoot, 'scratch');
const readmePath = path.join(scratchDir, 'README.md');

/**
 * Recursively lists scratch/** files, skipping dotfiles/dotdirs and
 * scratch/README.md — the same skip `bin/scratch-expiry.mjs` applies, since
 * the README documents the header format rather than being a temp file.
 */
function listScratchFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listScratchFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (fullPath === readmePath) continue;

    results.push(fullPath);
  }

  return results;
}

function relPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

describe('scratch/** headers (spec §8.6)', () => {
  for (const filePath of listScratchFiles(scratchDir)) {
    const rel = relPath(filePath);
    it(`${rel}: has a header parseScratchHeader accepts`, () => {
      const header = parseScratchHeader(fs.readFileSync(filePath, 'utf8'));
      expect(
        header,
        `${rel}: missing or invalid scratch header (purpose/owner/created/expires required, dates as YYYY-MM-DD)`,
      ).not.toBeNull();
    });
  }

  it('scratch/README.md (skipped from enforcement above) still carries a header parseScratchHeader accepts', () => {
    const header = parseScratchHeader(fs.readFileSync(readmePath, 'utf8'));
    expect(header, 'scratch/README.md: its own worked-example header must be valid').not.toBeNull();
  });
});
