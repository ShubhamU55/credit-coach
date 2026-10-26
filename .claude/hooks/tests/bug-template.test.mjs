import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// §8.1a bug ticket template (docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md
// "Bug ticket template" + the W3-3 brief's exact field-id list). Required field ids carry
// `validations.required: true`; the four fields filled later by bug-analyst/bug-reporter at
// RCA/close time are optional (required `false`, or the key omitted entirely).
const REQUIRED_FIELD_IDS = [
  'summary',
  'severity',
  'found-by',
  'commit',
  'environment',
  'steps',
  'expected',
  'actual',
  'evidence',
  'suspected-area',
];
const OPTIONAL_FIELD_IDS = ['rca', 'fix-approach', 'regression-test', 'verification'];
const ALL_FIELD_IDS = [...REQUIRED_FIELD_IDS, ...OPTIONAL_FIELD_IDS];
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low'];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const templatePath = path.join(repoRoot, '.github/ISSUE_TEMPLATE/bug.yml');

describe('.github/ISSUE_TEMPLATE/bug.yml', () => {
  it('exists and parses as YAML', () => {
    expect(fs.existsSync(templatePath), `missing ${templatePath}`).toBe(true);
    const text = fs.readFileSync(templatePath, 'utf8');
    expect(() => parse(text)).not.toThrow();
  });

  function loadTemplate() {
    const text = fs.readFileSync(templatePath, 'utf8');
    return parse(text);
  }

  function fieldBlocks(template) {
    return (template.body || []).filter((block) => block && typeof block.id === 'string');
  }

  it('has a top-level "body" array of blocks', () => {
    const template = loadTemplate();
    expect(Array.isArray(template.body)).toBe(true);
    expect(template.body.length).toBeGreaterThan(0);
  });

  it('has exactly the field ids the brief names, and no others', () => {
    const template = loadTemplate();
    const ids = fieldBlocks(template).map((block) => block.id);
    expect(new Set(ids)).toEqual(new Set(ALL_FIELD_IDS));
    expect(ids.length).toBe(ALL_FIELD_IDS.length);
  });

  it('"severity" is a dropdown with exactly critical/high/medium/low', () => {
    const template = loadTemplate();
    const severity = fieldBlocks(template).find((block) => block.id === 'severity');
    expect(severity).toBeTruthy();
    expect(severity.type).toBe('dropdown');
    expect(severity.attributes?.options).toEqual(SEVERITY_OPTIONS);
  });

  it.each(REQUIRED_FIELD_IDS)('"%s" has validations.required: true', (id) => {
    const template = loadTemplate();
    const block = fieldBlocks(template).find((b) => b.id === id);
    expect(block, `field "${id}" not found`).toBeTruthy();
    expect(block.validations?.required).toBe(true);
  });

  it.each(OPTIONAL_FIELD_IDS)('"%s" has validations.required: false (or omitted)', (id) => {
    const template = loadTemplate();
    const block = fieldBlocks(template).find((b) => b.id === id);
    expect(block, `field "${id}" not found`).toBeTruthy();
    expect(block.validations?.required ?? false).toBe(false);
  });

  it('top-level "labels" includes "bug"', () => {
    const template = loadTemplate();
    expect(Array.isArray(template.labels)).toBe(true);
    expect(template.labels).toContain('bug');
  });
});
