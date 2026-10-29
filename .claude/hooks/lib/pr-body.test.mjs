import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrBody } from './pr-body.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const AGENTS_PLACEHOLDER = '<for example /build, /qa, /pr-review, or "none">';
const LEDGER_PLACEHOLDER = '<path under docs/journal/ or docs/agent-runs/>';
const VERIFY_PLACEHOLDER = '<result line, e.g. "29 test files, 1586 tests passed">';

/** A PR body shaped like .github/pull_request_template.md, with the given values filled in. */
function body({
  verify = '29 test files, 1586 tests passed',
  agents = '/build, /pr-review',
  ledger = 'docs/agent-runs/2026-10-28-pd-4.md',
} = {}) {
  return [
    '## Summary',
    '',
    '<!-- What changed and why. -->',
    '',
    '## Test evidence',
    '',
    '<!-- Paste the command and the result line. -->',
    '',
    `- [ ] \`pnpm verify\`: ${verify}`,
    '- [ ] Other checks that apply (admin E2E, Maestro flow): <command and result>',
    '',
    '## AI-assisted',
    '',
    '<!-- Disclose it here. -->',
    '',
    `- Agents or commands used: ${agents}`,
    `- Process journal entry or run ledger: ${ledger}`,
    '',
  ].join('\n');
}

describe('checkPrBody', () => {
  it('passes the filled template', () => {
    expect(checkPrBody(body())).toEqual({ ok: true, missing: [] });
  });

  it('accepts "none" as the agents answer', () => {
    expect(checkPrBody(body({ agents: 'none', ledger: 'none' }))).toEqual({
      ok: true,
      missing: [],
    });
    expect(checkPrBody(body({ agents: 'None', ledger: 'NONE' })).ok).toBe(true);
  });

  it('fails when the AI-assisted section is missing', () => {
    const withoutSection = body().split('## AI-assisted')[0];
    const result = checkPrBody(withoutSection);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('## AI-assisted section');
  });

  it('fails when the placeholder is left', () => {
    const result = checkPrBody(body({ agents: AGENTS_PLACEHOLDER }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('AI-assisted: agents or commands used');
    expect(result.missing).not.toContain('AI-assisted: process journal entry or run ledger');
  });

  it('fails when the ledger placeholder is left', () => {
    const result = checkPrBody(body({ ledger: LEDGER_PLACEHOLDER }));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['AI-assisted: process journal entry or run ledger']);
  });

  it('fails when a value is empty', () => {
    const result = checkPrBody(body({ agents: '' }));
    expect(result.missing).toContain('AI-assisted: agents or commands used');
  });

  it('fails an empty body', () => {
    for (const empty of [null, undefined, '']) {
      const result = checkPrBody(empty);
      expect(result.ok).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    }
  });

  it('handles CRLF bodies', () => {
    expect(checkPrBody(body().replaceAll('\n', '\r\n'))).toEqual({ ok: true, missing: [] });
  });

  it('treats comment-only sections as empty', () => {
    const commentOnly =
      '## Test evidence\n\n- `pnpm verify`: ok\n\n## AI-assisted\n\n<!-- ... -->\n';
    const result = checkPrBody(commentOnly);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      'AI-assisted: agents or commands used',
      'AI-assisted: process journal entry or run ledger',
    ]);
  });

  it('fails when Test evidence has no command output', () => {
    const result = checkPrBody(body({ verify: VERIFY_PLACEHOLDER }));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['Test evidence: a pnpm verify result line']);
  });

  it('accepts a checked Test evidence box', () => {
    const checked = body().replace('- [ ] `pnpm verify`', '- [x] `pnpm verify`');
    expect(checkPrBody(checked).ok).toBe(true);
  });

  it('fails when Test evidence never mentions pnpm verify', () => {
    const noVerify = body().replace(/^- \[ \] `pnpm verify`.*$/m, '- tests pass');
    expect(checkPrBody(noVerify).missing).toContain('Test evidence: a pnpm verify result line');
  });

  it('fails when the Test evidence section is missing', () => {
    const noEvidence = body().replace(/## Test evidence[\s\S]*?(?=## AI-assisted)/, '');
    expect(checkPrBody(noEvidence).missing).toEqual(['Test evidence: a pnpm verify result line']);
  });
});

describe('pr-body workflow', () => {
  const text = fs.readFileSync(path.join(repoRoot, '.github/workflows/pr-body.yml'), 'utf8');

  it('does not interpolate the body into run', () => {
    expect(text).not.toMatch(/run:[^\n]*\$\{\{\s*github\.event\.pull_request\.body/);
    expect(text).toContain('PR_BODY: ${{ github.event.pull_request.body }}');
  });
});
