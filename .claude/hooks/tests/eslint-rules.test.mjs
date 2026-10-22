import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// Cold-start ESLint (plugin resolution) flakes past the 5s default under CPU load.
vi.setConfig({ testTimeout: 30_000 });

function lintTextAt(cwd) {
  const eslint = new ESLint({ cwd });
  return (code, filePath) => eslint.lintText(code, { filePath: path.resolve(cwd, filePath) });
}

describe('engine purity rules (packages/engine)', () => {
  const lint = lintTextAt(path.join(repoRoot, 'packages/engine'));

  it('rejects argless new Date()', async () => {
    const [result] = await lint('export const t = new Date();\n', 'src/x.ts');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].ruleId).toBe('no-restricted-syntax');
  });

  it('rejects Date.now()', async () => {
    const [result] = await lint('export const t = Date.now();\n', 'src/x.ts');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].ruleId).toBe('no-restricted-syntax');
  });

  it("allows new Date('2026-10-21')", async () => {
    const [result] = await lint("export const t = new Date('2026-10-21');\n", 'src/x.ts');
    expect(result.messages).toHaveLength(0);
  });

  it('rejects react and node:fs imports', async () => {
    const [result] = await lint(
      "import React from 'react';\nimport fs from 'node:fs';\nexport const x = 1;\n",
      'src/x.ts',
    );
    const restricted = result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(restricted).toHaveLength(2);
  });

  it.each([
    ['fetch', "export const r = fetch('https://example.com');\n", 'no-restricted-globals'],
    ['process.env', 'export const home = process.env.HOME;\n', 'no-restricted-globals'],
    ['XMLHttpRequest', 'export const x = new XMLHttpRequest();\n', 'no-restricted-globals'],
    ['WebSocket', "export const w = new WebSocket('wss://x');\n", 'no-restricted-globals'],
    ['globalThis.Date.now()', 'export const t = globalThis.Date.now();\n', 'no-restricted-globals'],
    ['Math.random()', 'export const r = Math.random();\n', 'no-restricted-syntax'],
    ['bare Date()', 'export const s = Date();\n', 'no-restricted-syntax'],
    [
      "import net from 'net'",
      "import net from 'net';\nexport const n = net;\n",
      'no-restricted-imports',
    ],
    [
      "import path from 'path'",
      "import path from 'path';\nexport const p = path;\n",
      'no-restricted-imports',
    ],
    [
      "import os from 'os'",
      "import os from 'os';\nexport const o = os;\n",
      'no-restricted-imports',
    ],
    [
      "import crypto from 'crypto'",
      "import c from 'crypto';\nexport const k = c;\n",
      'no-restricted-imports',
    ],
  ])('rejects %s', async (_, code, ruleId) => {
    const [result] = await lint(code, 'src/x.ts');
    const hits = result.messages.filter((m) => m.ruleId === ruleId && m.severity === 2);
    expect(hits.length, JSON.stringify(result.messages)).toBeGreaterThanOrEqual(1);
  });

  it('still allows Date.UTC and new Date(value) alongside the new bans', async () => {
    const [result] = await lint(
      'export const t = new Date(Date.UTC(2026, 9, 21)).getTime() + Math.max(1, 2);\n',
      'src/x.ts',
    );
    expect(result.messages).toHaveLength(0);
  });

  it('warns max-lines (not errors) for a 401-line file', async () => {
    const code = Array.from({ length: 401 }, (_, i) => `// line ${i}`).join('\n') + '\n';
    const [result] = await lint(code, 'src/long.ts');
    const maxLines = result.messages.find((m) => m.ruleId === 'max-lines');
    expect(maxLines).toBeDefined();
    expect(maxLines.severity).toBe(1);
  });
});

describe('mobile rules (apps/mobile)', () => {
  const lint = lintTextAt(path.join(repoRoot, 'apps/mobile'));

  it('rejects a raw hex literal in a component', async () => {
    const [result] = await lint("const c = '#FFAA00';\n", 'src/ui/components/X.tsx');
    const hex = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(hex.length).toBeGreaterThanOrEqual(1);
  });

  it('allows hex inside src/ui/theme/color.ts', async () => {
    const [result] = await lint("export const c = '#FFAA00';\n", 'src/ui/theme/color.ts');
    const hex = result.messages.filter(
      (m) => m.ruleId === 'no-restricted-syntax' && /hex/i.test(m.message),
    );
    expect(hex).toHaveLength(0);
  });

  it('rejects importing @credit-coach/admin', async () => {
    const [result] = await lint(
      "import x from '@credit-coach/admin';\nexport const y = x;\n",
      'src/ui/components/Y.tsx',
    );
    const restricted = result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(restricted.length).toBeGreaterThanOrEqual(1);
  });
});

describe('admin rules (apps/admin)', () => {
  const lint = lintTextAt(path.join(repoRoot, 'apps/admin'));

  it('rejects importing @credit-coach/mobile', async () => {
    const [result] = await lint(
      "import x from '@credit-coach/mobile';\nexport const y = x;\n",
      'app/page.tsx',
    );
    const restricted = result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
    expect(restricted.length).toBeGreaterThanOrEqual(1);
  });
});
