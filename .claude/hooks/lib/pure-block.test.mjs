import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_GLOB, extractBlock, loadBlocks } from './pure-block.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const contractsSource = fs.readFileSync(path.join(here, 'contracts.mjs'), 'utf8');

const FIXTURE = [
  "const workflowName = 'demo';",
  '// <contracts>',
  'const ANSWER = 42;',
  'function double(n) {',
  '  return n * 2;',
  '}',
  '// </contracts>',
  '',
  '// <pure>',
  'function quadruple(n) {',
  '  return double(double(n));',
  '}',
  '// </pure>',
  'agent(quadruple(ANSWER));',
].join('\r\n');

describe('WORKFLOW_GLOB', () => {
  it('points at the workflow scripts', () => {
    expect(WORKFLOW_GLOB).toBe('.claude/workflows/*.workflow.js');
  });
});

describe('extractBlock', () => {
  it('returns the lines between the markers', () => {
    expect(extractBlock(FIXTURE, 'contracts')).toBe(
      'const ANSWER = 42;\nfunction double(n) {\n  return n * 2;\n}',
    );
    expect(extractBlock(FIXTURE, 'pure')).toBe(
      'function quadruple(n) {\n  return double(double(n));\n}',
    );
  });

  it('throws when the block is missing', () => {
    expect(() => extractBlock('const x = 1;', 'pure')).toThrow(/pure/);
  });

  it('throws when the closing marker is missing', () => {
    expect(() => extractBlock('// <pure>\nconst x = 1;', 'pure')).toThrow(/pure/);
  });

  it('throws when the block is repeated', () => {
    const twice = `${FIXTURE}\n// <pure>\nconst y = 2;\n// </pure>`;
    expect(() => extractBlock(twice, 'pure')).toThrow(/pure/);
  });

  it('throws when the closing marker comes first', () => {
    expect(() => extractBlock('// </pure>\nconst x = 1;\n// <pure>', 'pure')).toThrow(/pure/);
  });
});

describe('loadBlocks', () => {
  it('evaluates contracts and pure together and returns the requested names', () => {
    const { quadruple, ANSWER } = loadBlocks(FIXTURE, ['quadruple', 'ANSWER']);
    expect(ANSWER).toBe(42);
    expect(quadruple(3)).toBe(12);
  });

  it('throws on an unknown name', () => {
    expect(() => loadBlocks(FIXTURE, ['nope'])).toThrow();
  });

  it('rejects a name that is not an identifier', () => {
    expect(() => loadBlocks(FIXTURE, ['a); evil(('])).toThrow(/identifier/);
  });

  it('throws when the source has neither block', () => {
    expect(() => loadBlocks('const x = 1;', ['x'])).toThrow(/contracts|pure/);
  });

  it('throws when a block calls Date.now() at load time', () => {
    const source = '// <pure>\nconst startedAt = Date.now();\n// </pure>';
    expect(() => loadBlocks(source, ['startedAt'])).toThrow(/Date\.now/);
  });

  it('throws when a loaded function reads the clock or randomness', () => {
    const source = [
      '// <pure>',
      'function stamp() { return Date.now(); }',
      'function today() { return new Date(); }',
      'function bare() { return Date(); }',
      'function roll() { return Math.random(); }',
      "function fixed() { return new Date('2026-10-21T00:00:00Z').toISOString(); }",
      "function utc() { return Date.UTC(2026, 9, 21) === Date.parse('2026-10-21T00:00:00Z'); }",
      '// </pure>',
    ].join('\n');
    const fns = loadBlocks(source, ['stamp', 'today', 'bare', 'roll', 'fixed', 'utc']);

    expect(() => fns.stamp()).toThrow(/Date\.now/);
    expect(() => fns.today()).toThrow(/Date/);
    expect(() => fns.bare()).toThrow(/Date/);
    expect(() => fns.roll()).toThrow(/Math\.random/);
    expect(fns.fixed()).toBe('2026-10-21T00:00:00.000Z');
    expect(fns.utc()).toBe(true);
  });

  it('loads the real contracts block standalone (proves it is import-free and pure)', () => {
    const exportLine = contractsSource.split(/\r?\n/).find((line) => line.startsWith('export {'));
    const names = exportLine
      .replace(/^export \{\s*/, '')
      .replace(/\s*\};?\s*$/, '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    const loaded = loadBlocks(contractsSource, names);

    expect(Object.keys(loaded)).toEqual(names);
    expect(loaded.nextStep([{ ok: false }, null, { ok: false }])).toBe('escalate');
    expect(loaded.normalizePath('a\\b.ts')).toBe('a/b.ts');
  });
});
