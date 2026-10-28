import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const adr = fs.readFileSync(path.join(repoRoot, 'docs/adr/0002-curated-ai-dev-setup.md'), 'utf8');

const SKIPPED_DIRS = new Set(['node_modules', '.git', '.next', '.expo', 'coverage']);
const INVENTORY_COLUMNS = ['Plugin', 'Purpose', 'Scope', 'Version', 'Pin', 'Executable parts'];

function settingsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : settingsFiles(full);
    return /^settings(\.local)?\.json$/.test(entry.name) && path.basename(dir) === '.claude'
      ? [full]
      : [];
  });
}

const enabledPlugins = settingsFiles(repoRoot).flatMap((file) => {
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys(settings.enabledPlugins ?? {}).map((plugin) => ({
    plugin,
    file: path.relative(repoRoot, file).replaceAll('\\', '/'),
  }));
});

const cellsOf = (row) =>
  row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

describe('ADR 0002 plugin inventory', () => {
  it('finds the plugins this repo enables (guards against the scan silently finding none)', () => {
    expect(enabledPlugins.map(({ plugin }) => plugin)).toContain('expo@claude-plugins-official');
  });

  it('has an inventory table with the agreed columns', () => {
    const header = adr.split('\n').find((line) => line.startsWith('|') && line.includes('Plugin'));

    expect(cellsOf(header ?? '')).toEqual(INVENTORY_COLUMNS);
  });

  it.each(enabledPlugins)('lists $plugin ($file) with every column filled in', ({ plugin }) => {
    const row = adr
      .split('\n')
      .find((line) => line.startsWith('|') && line.includes(`\`${plugin}\``));

    expect(row, `${plugin} has no row in the inventory table`).toBeDefined();
    const cells = cellsOf(row);
    expect(cells).toHaveLength(INVENTORY_COLUMNS.length);
    expect(cells.filter((cell) => cell === '')).toEqual([]);
  });

  it('says whether each plugin is pinned', () => {
    for (const { plugin } of enabledPlugins) {
      const row =
        adr.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${plugin}\``)) ??
        '';

      expect(cellsOf(row)[4], plugin).toMatch(/commit-pinned|unpinned/i);
    }
  });
});
