import { describe, it, expect } from 'vitest';
import {
  SEVERITIES,
  CATEGORIES,
  COMMIT_TYPES,
  MAX_RETRIES,
  CONFIDENT,
  FINDING_SCHEMA,
  VERDICT_SCHEMA,
  GATE_FACTS_SCHEMA,
  envelopeSchema,
  normalizePath,
  matchesAllowed,
  isBlocking,
  dedupeFindings,
  applyVerifierPolicy,
  checkCommitMessage,
  checkStart,
  checkDrift,
  nextStep,
  wrapUntrusted,
} from './contracts.mjs';

const TASK = {
  id: '2',
  files: ['packages/engine/src/format.ts', 'packages/engine/src/index.ts'],
  createFiles: ['packages/engine/src/format.ts'],
  testFiles: ['packages/engine/src/format.test.ts'],
  testCommand: 'pnpm --filter @credit-coach/engine test',
};

const CLEAN_FACTS = {
  head: 'b2',
  attemptStart: 'a1',
  changedFiles: [
    'packages/engine/src/format.ts',
    'packages/engine/src/index.ts',
    'packages/engine/src/format.test.ts',
  ],
  dirtyFiles: [],
  missingFiles: [],
  commits: [
    {
      sha: 'b2',
      message: 'feat(engine): add INR, percent, date, score-range and PAN formatters\n',
    },
  ],
  testCommand: 'pnpm --filter @credit-coach/engine test',
  testExitCode: 0,
  testOutputTail: 'Tests 22 passed',
  verifyExitCode: 0,
};

function finding(overrides) {
  return {
    id: 'f1',
    severity: 'medium',
    category: 'correctness',
    file: 'a.ts',
    line: 12,
    title: 'Off by one',
    detail: 'Loop skips the last card.',
    evidence: 'for (let i = 1; i < n; i++)',
    ...overrides,
  };
}

describe('constants', () => {
  it('pins the enums and thresholds', () => {
    expect(SEVERITIES).toEqual(['critical', 'high', 'medium', 'low']);
    expect(CATEGORIES).toEqual([
      'correctness',
      'security',
      'consistency',
      'test-adequacy',
      'silent-failure',
      'ui',
      'spec',
      'domain',
      'performance',
    ]);
    expect(COMMIT_TYPES).toEqual([
      'feat',
      'fix',
      'refactor',
      'docs',
      'test',
      'chore',
      'perf',
      'ci',
    ]);
    expect(MAX_RETRIES).toBe(2);
    expect(CONFIDENT).toBe(0.8);
  });
});

describe('normalizePath', () => {
  it('turns Windows backslashes into forward slashes', () => {
    expect(normalizePath('packages\\engine\\src\\format.ts')).toBe('packages/engine/src/format.ts');
  });

  it('strips a leading ./ and keeps case', () => {
    expect(normalizePath('./Apps/Mobile/X.tsx')).toBe('Apps/Mobile/X.tsx');
    expect(normalizePath('.\\docs\\PRD.md')).toBe('docs/PRD.md');
  });
});

describe('matchesAllowed', () => {
  it('matches ** at any depth', () => {
    expect(matchesAllowed('apps/mobile/src/a.edge.test.ts', ['**/*.edge.test.ts'])).toBe(true);
    expect(matchesAllowed('a.edge.test.ts', ['**/*.edge.test.ts'])).toBe(true);
    expect(matchesAllowed('docs/test-reports/bugs/12/a.png', ['docs/test-reports/**'])).toBe(true);
  });

  it('matches exact paths, including a Windows-style changed path', () => {
    expect(
      matchesAllowed('packages\\engine\\src\\format.ts', ['packages/engine/src/format.ts']),
    ).toBe(true);
  });

  it('keeps * inside one segment and treats dots literally', () => {
    expect(matchesAllowed('.claude/agents/x.md', ['.claude/agents/*.md'])).toBe(true);
    expect(matchesAllowed('.claude/agents/sub/x.md', ['.claude/agents/*.md'])).toBe(false);
    expect(matchesAllowed('packages/engine/src/formatXts', ['packages/engine/src/format.ts'])).toBe(
      false,
    );
  });

  it('rejects everything when no pattern matches', () => {
    expect(matchesAllowed('packages/engine/src/utilization.ts', TASK.files)).toBe(false);
    expect(matchesAllowed('a.ts', [])).toBe(false);
  });
});

describe('isBlocking', () => {
  it('is true only for critical and high', () => {
    expect(SEVERITIES.map((severity) => isBlocking({ severity }))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('dedupeFindings', () => {
  it('keeps the security category on a severity tie, so the verifier still fails closed', () => {
    const merged = dedupeFindings([
      finding({ id: 'c', category: 'correctness', severity: 'medium' }),
      finding({ id: 's', category: 'security', severity: 'medium' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].category).toBe('security');
    expect(applyVerifierPolicy(merged[0], null)).toBe('confirmed');
  });

  it('keeps the security category when a stricter non-security finding wins', () => {
    const merged = dedupeFindings([
      finding({ id: 's', category: 'security', severity: 'medium' }),
      finding({ id: 'c', category: 'correctness', severity: 'high', proof: 'p' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ category: 'security', severity: 'high', proof: 'p' });
    expect(applyVerifierPolicy(merged[0], null)).toBe('confirmed');
  });

  it('merges two findings on the same file|line into the strictest one with both foundBy', () => {
    const medium = finding({ id: 'f1', severity: 'medium', foundBy: ['code-reviewer'] });
    const high = finding({
      id: 'f2',
      severity: 'high',
      proof: 'Last card never paid.',
      foundBy: ['silent-failure-hunter'],
    });

    const result = dedupeFindings([medium, high]);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
    expect(result[0].proof).toBe('Last card never paid.');
    expect(result[0].foundBy).toEqual(['code-reviewer', 'silent-failure-hunter']);
  });

  it('keys on the normalized title when line is not an integer, and keeps first-seen order', () => {
    const a = finding({ id: 'a', file: 'b.ts', line: null, title: 'Missing  Guard' });
    const b = finding({ id: 'b', file: 'a.ts', line: 3 });
    const c = finding({ id: 'c', file: 'b.ts', line: null, title: 'missing guard ' });

    const result = dedupeFindings([a, b, c]);

    expect(result.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const first = finding({ foundBy: ['x'] });
    const second = finding({ foundBy: ['y'] });

    dedupeFindings([first, second]);

    expect(first.foundBy).toEqual(['x']);
    expect(second.foundBy).toEqual(['y']);
  });
});

describe('applyVerifierPolicy', () => {
  const security = finding({ category: 'security', severity: 'medium' });
  const correctness = finding({ category: 'correctness', severity: 'medium' });

  it('keeps security findings unless refuted with confidence', () => {
    expect(applyVerifierPolicy(security, null)).toBe('confirmed');
    expect(applyVerifierPolicy(security, { isReal: false, confidence: 0.7 })).toBe('confirmed');
    expect(applyVerifierPolicy(security, { isReal: false, confidence: 0.9 })).toBe('refuted');
  });

  it('keeps critical findings of any category unless refuted with confidence', () => {
    const critical = finding({ severity: 'critical' });
    expect(applyVerifierPolicy(critical, null)).toBe('confirmed');
    expect(applyVerifierPolicy(critical, { isReal: false, confidence: 0.79 })).toBe('confirmed');
  });

  it('refutes other findings unless confirmed with confidence', () => {
    expect(applyVerifierPolicy(correctness, null)).toBe('refuted');
    expect(applyVerifierPolicy(correctness, { isReal: true, confidence: 0.85 })).toBe('confirmed');
    expect(applyVerifierPolicy(correctness, { isReal: true, confidence: 0.5 })).toBe('refuted');
  });
});

describe('checkCommitMessage', () => {
  it('accepts a conventional subject with a scope', () => {
    expect(checkCommitMessage('feat(engine): add formatters\n\nBody text.')).toEqual([]);
  });

  it('flags a non-conventional subject', () => {
    expect(checkCommitMessage('Update stuff')).toEqual(['commit-format: Update stuff']);
  });

  it('flags a subject over 72 chars', () => {
    const subject = `feat: ${'x'.repeat(67)}`;
    expect(subject.length).toBe(73);
    expect(checkCommitMessage(subject)).toEqual([`commit-format: ${subject}`]);
  });

  it('flags attribution lines anywhere in the body', () => {
    expect(checkCommitMessage('fix: a\r\n\r\nco-authored-by: Bot <b@x>')).toEqual([
      'commit-attribution: fix: a',
    ]);
    expect(checkCommitMessage('fix: a\n\n🤖 Generated with a tool')).toEqual([
      'commit-attribution: fix: a',
    ]);
  });
});

describe('checkStart', () => {
  it('reports each dirty file', () => {
    expect(checkStart({ dirtyFiles: ['.design/x'] })).toEqual(['dirty-start: .design/x']);
  });

  it('is empty for a clean tree', () => {
    expect(checkStart({ head: 'a1', dirtyFiles: [] })).toEqual([]);
  });

  it('fails closed when dirtyFiles is absent', () => {
    expect(checkStart({ head: 'a1' })).toEqual(['incomplete-facts: dirtyFiles']);
    expect(checkStart(null)).toEqual(['incomplete-facts: dirtyFiles']);
  });
});

describe('checkDrift', () => {
  it('(a) fails on a dirty file', () => {
    const result = checkDrift({ ...CLEAN_FACTS, dirtyFiles: ['x'] }, TASK);
    expect(result).toEqual({ ok: false, reasons: ['uncommitted: x'] });
  });

  it('(b) fails on a changed file outside the allowed list', () => {
    const facts = {
      ...CLEAN_FACTS,
      changedFiles: [...CLEAN_FACTS.changedFiles, 'packages/engine/src/utilization.ts'],
    };
    expect(checkDrift(facts, TASK)).toEqual({
      ok: false,
      reasons: ['drift: packages/engine/src/utilization.ts'],
    });
  });

  it('(c) passes a clean attempt', () => {
    expect(checkDrift(CLEAN_FACTS, TASK)).toEqual({ ok: true, reasons: [] });
  });

  it('(d) fails on a Co-Authored-By line in a commit body', () => {
    const facts = {
      ...CLEAN_FACTS,
      commits: [{ sha: 'b2', message: 'feat(engine): add formatters\n\nCo-Authored-By: X' }],
    };
    expect(checkDrift(facts, TASK).reasons).toEqual([
      'commit-attribution: feat(engine): add formatters',
    ]);
  });

  it('(e) fails on a non-conventional subject', () => {
    const facts = { ...CLEAN_FACTS, commits: [{ sha: 'b2', message: 'Update stuff' }] };
    expect(checkDrift(facts, TASK).reasons).toEqual(['commit-format: Update stuff']);
  });

  it('(f) fails when the tests failed', () => {
    expect(checkDrift({ ...CLEAN_FACTS, testExitCode: 1 }, TASK).reasons).toEqual([
      'tests-failed: exit 1',
    ]);
  });

  it('(g) fails when there is no commit', () => {
    expect(checkDrift({ ...CLEAN_FACTS, commits: [], changedFiles: [] }, TASK)).toEqual({
      ok: false,
      reasons: ['no-commit'],
    });
  });

  it('(h) fails when a Create:/Test: file is missing at HEAD', () => {
    const facts = { ...CLEAN_FACTS, missingFiles: ['packages/engine/src/format.test.ts'] };
    expect(checkDrift(facts, TASK).reasons).toEqual([
      'missing: packages/engine/src/format.test.ts',
    ]);
  });

  it('reports a different test command and a failed verify', () => {
    const facts = { ...CLEAN_FACTS, testCommand: 'pnpm test', verifyExitCode: 2 };
    expect(checkDrift(facts, TASK).reasons).toEqual([
      'test-command-mismatch',
      'verify-failed: exit 2',
    ]);
  });

  it('lists every reason in the documented order', () => {
    const facts = {
      ...CLEAN_FACTS,
      dirtyFiles: ['d.ts'],
      missingFiles: ['m.ts'],
      changedFiles: ['packages\\engine\\src\\format.ts', 'z.ts'],
      testCommand: 'pnpm x',
      testExitCode: 1,
      verifyExitCode: 1,
      commits: [{ sha: 'c', message: 'oops' }],
    };
    expect(checkDrift(facts, { ...TASK, testCommand: null }).reasons).toEqual([
      'uncommitted: d.ts',
      'missing: m.ts',
      'drift: z.ts',
      'test-command-mismatch',
      'no-test-command',
      'tests-failed: exit 1',
      'verify-failed: exit 1',
      'commit-format: oops',
    ]);
  });

  it.each(['changedFiles', 'missingFiles'])(
    'fails closed when a check-mode result with commits omits %s',
    (field) => {
      const facts = { ...CLEAN_FACTS };
      delete facts[field];
      expect(checkDrift(facts, TASK)).toEqual({
        ok: false,
        reasons: [`incomplete-facts: ${field}`],
      });
    },
  );

  it('fails closed when dirtyFiles is absent, even with no commits', () => {
    const facts = { ...CLEAN_FACTS };
    delete facts.dirtyFiles;
    expect(checkDrift(facts, TASK)).toEqual({
      ok: false,
      reasons: ['incomplete-facts: dirtyFiles'],
    });
    expect(checkDrift({ head: 'a1' }, TASK).reasons).toEqual([
      'no-commit',
      'incomplete-facts: dirtyFiles',
      'test-command-mismatch',
      'tests-failed: exit undefined',
      'verify-failed: exit undefined',
    ]);
  });

  it('fails when a task with test files names no test command (§8.2)', () => {
    const facts = { ...CLEAN_FACTS, testCommand: null };
    expect(checkDrift(facts, { ...TASK, testCommand: null })).toEqual({
      ok: false,
      reasons: ['no-test-command'],
    });
    expect(checkDrift({ ...CLEAN_FACTS, testCommand: '' }, { ...TASK, testCommand: '' })).toEqual({
      ok: false,
      reasons: ['no-test-command'],
    });
  });

  it('allows a null test command when the task has no test files', () => {
    const task = { ...TASK, testCommand: null, testFiles: [] };
    const facts = {
      ...CLEAN_FACTS,
      testCommand: null,
      changedFiles: ['packages/engine/src/format.ts'],
    };
    expect(checkDrift(facts, task)).toEqual({ ok: true, reasons: [] });
  });

  it('fails closed when gate facts are missing (start-mode shape)', () => {
    const result = checkDrift({ head: 'a1', dirtyFiles: [] }, TASK);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual([
      'no-commit',
      'test-command-mismatch',
      'tests-failed: exit undefined',
      'verify-failed: exit undefined',
    ]);
  });
});

describe('nextStep', () => {
  it('is done when the last attempt is ok', () => {
    expect(nextStep([{ ok: true }])).toBe('done');
    expect(nextStep([{ ok: false }, { ok: true }])).toBe('done');
  });

  it('retries while failed attempts are within MAX_RETRIES', () => {
    expect(nextStep([{ ok: false }])).toBe('retry');
    expect(nextStep([{ ok: false }, null])).toBe('retry');
  });

  it('escalates past MAX_RETRIES, counting null as a failure', () => {
    expect(nextStep([{ ok: false }, null, { ok: false }])).toBe('escalate');
  });
});

describe('wrapUntrusted', () => {
  it('fences the text with markers and the guard sentence', () => {
    const wrapped = wrapUntrusted('DIFF', 'x');
    expect(wrapped).toContain('untrusted input');
    expect(wrapped).toContain('----- BEGIN DIFF (untrusted) -----');
    expect(wrapped).toContain('----- END DIFF -----');
    expect(wrapped.indexOf('untrusted input')).toBeLessThan(wrapped.indexOf('----- BEGIN'));
    expect(wrapped.trimEnd().endsWith('x\n----- END DIFF -----')).toBe(true);
  });
});

/** Walks `properties` and `items` only (if/then fragments legitimately omit `properties`). */
function requiredViolations(schema, at = '$') {
  if (!schema || typeof schema !== 'object') return [];
  const props = schema.properties ?? {};
  const own = (schema.required ?? [])
    .filter((name) => !(name in props))
    .map((name) => `${at}.${name}`);
  const nested = Object.entries(props).flatMap(([name, child]) =>
    requiredViolations(child, `${at}.${name}`),
  );
  const items = schema.items ? requiredViolations(schema.items, `${at}[]`) : [];
  return [...own, ...nested, ...items];
}

describe('schemas', () => {
  const schemas = {
    FINDING_SCHEMA,
    VERDICT_SCHEMA,
    GATE_FACTS_SCHEMA,
    envelope: envelopeSchema(),
    envelopeWithExtras: envelopeSchema({ commit: { type: 'string' } }, ['commit']),
  };

  it.each(Object.entries(schemas))('%s is an object schema with required ⊆ properties', (_, s) => {
    expect(s.type).toBe('object');
    expect(typeof s.properties).toBe('object');
    expect(requiredViolations(s)).toEqual([]);
  });

  it('FINDING_SCHEMA requires the core fields and proof for blocking severities', () => {
    expect(FINDING_SCHEMA.required).toEqual([
      'id',
      'severity',
      'category',
      'file',
      'title',
      'detail',
      'evidence',
    ]);
    expect(FINDING_SCHEMA.properties.severity.enum).toEqual(SEVERITIES);
    expect(FINDING_SCHEMA.properties.category.enum).toEqual(CATEGORIES);
    expect(FINDING_SCHEMA.properties.line.type).toEqual(['integer', 'null']);
    expect(FINDING_SCHEMA.properties.detail.maxLength).toBe(560);
    expect(FINDING_SCHEMA.allOf).toEqual([
      {
        if: { required: ['severity'], properties: { severity: { enum: ['critical', 'high'] } } },
        then: { required: ['proof'] },
      },
    ]);
  });

  it('envelopeSchema carries the §6 fields, caps and extras', () => {
    const s = envelopeSchema({ commit: { type: 'string' } }, ['commit']);
    expect(s.properties.status.enum).toEqual(['done', 'blocked', 'failed']);
    expect(s.properties.summary.maxLength).toBe(420);
    expect(s.properties.evidence.items.properties.output.maxLength).toBe(300);
    expect(s.properties.findings.items).toBe(FINDING_SCHEMA);
    expect(s.properties.blockedReason.type).toBe('string');
    expect(s.required).toEqual([
      'status',
      'summary',
      'filesTouched',
      'evidence',
      'findings',
      'commit',
    ]);
  });

  it('envelopeSchema returns a fresh object each call', () => {
    const a = envelopeSchema({ x: { type: 'string' } }, ['x']);
    const b = envelopeSchema();
    expect(b.properties.x).toBeUndefined();
    expect(b.required).not.toContain('x');
    expect(a).not.toBe(b);
  });

  it('envelopeSchema rejects a required extra with no property', () => {
    expect(() => envelopeSchema({}, ['ghost'])).toThrow(/ghost/);
  });

  it('VERDICT_SCHEMA and GATE_FACTS_SCHEMA have the agreed fields', () => {
    expect(VERDICT_SCHEMA.required).toEqual(['isReal', 'confidence', 'reasoning']);
    expect(VERDICT_SCHEMA.properties.confidence).toMatchObject({ minimum: 0, maximum: 1 });
    expect(Object.keys(GATE_FACTS_SCHEMA.properties)).toEqual([
      'head',
      'attemptStart',
      'changedFiles',
      'dirtyFiles',
      'missingFiles',
      'commits',
      'testCommand',
      'testExitCode',
      'testOutputTail',
      'verifyExitCode',
    ]);
    expect(GATE_FACTS_SCHEMA.required).toEqual(['head', 'dirtyFiles']);
    expect(GATE_FACTS_SCHEMA.properties.commits.items.required).toEqual(['sha', 'message']);
  });
});
