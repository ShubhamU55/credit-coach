import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
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

describe('the real pull request template', () => {
  const template = fs.readFileSync(path.join(repoRoot, '.github/pull_request_template.md'), 'utf8');

  it('fails the check while its three placeholders are unfilled', () => {
    expect(checkPrBody(template)).toEqual({
      ok: false,
      missing: [
        'Test evidence: a pnpm verify result line',
        'AI-assisted: agents or commands used',
        'AI-assisted: process journal entry or run ledger',
      ],
    });
  });

  it('passes once the result line, agents used and ledger path are filled in', () => {
    const filled = template
      .replace(/<result line[^>]*>/, '29 test files, 1586 tests passed')
      .replace(/<for example[^>]*>/, '/build, /pr-review')
      .replace(/<path under[^>]*>/, 'docs/agent-runs/2026-10-28-pd-4.md');

    expect(checkPrBody(filled)).toEqual({ ok: true, missing: [] });
  });
});

describe('pr-body workflow', () => {
  const wf = parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/pr-body.yml'), 'utf8'));
  const steps = Object.values(wf.jobs).flatMap((job) => job.steps);

  it('runs on pull requests only, with read-only contents permission', () => {
    expect(Object.keys(wf.on)).toEqual(['pull_request']);
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('does not interpolate the event payload into any run script', () => {
    const runs = steps.map((step) => step.run).filter((run) => typeof run === 'string');

    expect(runs.length).toBeGreaterThan(0);
    expect(runs.filter((run) => run.includes('github.event'))).toEqual([]);
  });

  it('passes the body to the check through the PR_BODY environment variable', () => {
    const check = steps.find((step) => step.run === 'node .claude/hooks/bin/pr-body-check.mjs');

    expect(check).toBeDefined();
    expect(check.env.PR_BODY).toBe('${{ github.event.pull_request.body }}');
  });
});
