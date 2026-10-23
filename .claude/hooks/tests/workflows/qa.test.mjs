// Unit-tests the `qa` workflow's `pure` block (loaded alongside its pasted `contracts` block via
// `loadBlocks`, exactly like the real Workflow runtime evaluates it). The orchestration code
// outside the blocks calls `agent`/`parallel`/`workflow`/`log`, which only exist inside a real
// Workflow run, so it is not exercised here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlocks } from '../../lib/pure-block.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(here, '../../../workflows/qa.workflow.js');
const source = fs.readFileSync(workflowPath, 'utf8');
const { selectTesters, splitDeviceBound, summarizeQa } = loadBlocks(source, [
  'selectTesters',
  'splitDeviceBound',
  'summarizeQa',
]);

describe('selectTesters', () => {
  it('picks functional + edge-case + security for an engine-only diff', () => {
    expect(selectTesters(['packages/engine/src/a.ts'])).toEqual([
      'functional-tester',
      'edge-case-hunter',
      'security-reviewer',
    ]);
  });

  it('picks all six testers, in the fixed canonical order, for a supabase + mobile diff', () => {
    expect(selectTesters(['supabase/x.sql', 'apps/mobile/a.tsx'])).toEqual([
      'functional-tester',
      'edge-case-hunter',
      'api-tester',
      'ui-tester',
      'integration-tester',
      'security-reviewer',
    ]);
  });

  it('always includes security-reviewer, even for an unrecognized path', () => {
    expect(selectTesters(['README.md'])).toEqual(['security-reviewer']);
  });

  it('caps at 6 testers', () => {
    const testers = selectTesters([
      'packages/engine/src/a.ts',
      'supabase/x.sql',
      'apps/mobile/a.tsx',
    ]);
    expect(testers.length).toBeLessThanOrEqual(6);
  });
});

describe('splitDeviceBound', () => {
  it('puts ui-tester in serial, since the emulator is shared', () => {
    expect(
      splitDeviceBound([
        'functional-tester',
        'ui-tester',
        'edge-case-hunter',
        'integration-tester',
      ]),
    ).toEqual({
      parallel: ['functional-tester', 'edge-case-hunter'],
      serial: ['ui-tester', 'integration-tester'],
    });
  });

  it('is all-parallel when no device-bound tester was selected', () => {
    expect(splitDeviceBound(['functional-tester', 'security-reviewer'])).toEqual({
      parallel: ['functional-tester', 'security-reviewer'],
      serial: [],
    });
  });
});

describe('summarizeQa', () => {
  it('lists a null tester result in failedTesters instead of dropping it (Review Focus #2)', () => {
    const qa = summarizeQa([{ tester: 'ui-tester', result: null }], []);
    expect(qa.failedTesters).toEqual(['ui-tester']);
    expect(qa.confirmed).toEqual([]);
    expect(qa.proposals).toEqual([]);
    expect(qa.counts).toEqual({ testers: 1, raw: 0, unique: 0, confirmed: 0, refuted: 0 });
  });

  it('lists a non-"done" tester result in failedTesters, not just a null one', () => {
    const qa = summarizeQa(
      [
        {
          tester: 'functional-tester',
          result: { status: 'blocked', blockedReason: 'no criteria' },
        },
      ],
      [],
    );
    expect(qa.failedTesters).toEqual(['functional-tester']);
  });

  it('collects findings and proposals from a done tester, and dedupes before verifying', () => {
    const finding = {
      id: 'f1',
      severity: 'medium',
      category: 'correctness',
      file: 'a.ts',
      line: 3,
      title: 'Off by one',
      detail: 'Loop skips the last card.',
      evidence: 'for (let i = 1; i < n; i++)',
    };
    const proposal = {
      name: 'covers the gap',
      layer: 'vitest',
      file: 'a.test.ts',
      assertion: 'asserts the last card is included',
      criterion: 'boundary:zero-amount',
    };
    const results = [
      {
        tester: 'functional-tester',
        result: { status: 'done', findings: [finding], proposals: [proposal] },
      },
    ];
    const qa = summarizeQa(results, [
      { isReal: true, confidence: 0.9, reasoning: 'confirmed by the diff' },
    ]);
    expect(qa.proposals).toEqual([proposal]);
    expect(qa.confirmed).toEqual([{ ...finding, foundBy: ['functional-tester'] }]);
    expect(qa.counts).toEqual({ testers: 1, raw: 1, unique: 1, confirmed: 1, refuted: 0 });
  });

  it('confirms a security finding with a missing verdict (fail closed), refutes a medium one', () => {
    const securityFinding = {
      id: 'sec1',
      severity: 'high',
      category: 'security',
      file: 'b.ts',
      line: null,
      title: 'Unvalidated input',
      detail: 'User input reaches a query unvalidated.',
      evidence: 'db.query(userInput)',
      proof: 'SQL injection path',
    };
    const mediumFinding = {
      id: 'med1',
      severity: 'medium',
      category: 'correctness',
      file: 'c.ts',
      line: null,
      title: 'Confusing name',
      detail: 'Variable name is misleading.',
      evidence: 'const x = 1;',
    };
    const results = [
      { tester: 'security-reviewer', result: { status: 'done', findings: [securityFinding] } },
      { tester: 'functional-tester', result: { status: 'done', findings: [mediumFinding] } },
    ];
    // Both findings get a missing (null) verdict -- index-aligned with dedupeFindings' order.
    const qa = summarizeQa(results, [null, null]);
    expect(qa.confirmed.map((f) => f.id)).toEqual(['sec1']);
    expect(qa.refuted).toBe(1);
  });
});
