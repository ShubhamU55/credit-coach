import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const appsDir = path.join(repoRoot, 'apps');
const MAX_POINTER_LINES = 10;

const read = (file) => fs.readFileSync(file, 'utf8');
const appsWithAgentsMd = () =>
  fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(appsDir, name, 'AGENTS.md')));

describe('nested app instructions', () => {
  it('finds at least one apps/*/AGENTS.md to check', () => {
    expect(appsWithAgentsMd().length).toBeGreaterThan(0);
  });

  it('gives every apps/*/AGENTS.md a sibling CLAUDE.md that imports it', () => {
    for (const name of appsWithAgentsMd()) {
      const claudeMd = path.join(appsDir, name, 'CLAUDE.md');

      expect(fs.existsSync(claudeMd), `apps/${name}/CLAUDE.md exists`).toBe(true);
      expect(read(claudeMd).split(/\r?\n/), `apps/${name}/CLAUDE.md imports AGENTS.md`).toContain(
        '@AGENTS.md',
      );
    }
  });

  it('keeps the nested CLAUDE.md files short pointers', () => {
    for (const name of appsWithAgentsMd()) {
      const claudeMd = path.join(appsDir, name, 'CLAUDE.md');
      if (!fs.existsSync(claudeMd)) continue;

      const lines = read(claudeMd).trimEnd().split(/\r?\n/);

      expect(lines.length, `apps/${name}/CLAUDE.md line count`).toBeLessThanOrEqual(
        MAX_POINTER_LINES,
      );
    }
  });
});
