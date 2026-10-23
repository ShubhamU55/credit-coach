// Unit-tests the `feature-build` workflow's `pure` block (loaded alongside its pasted `contracts`
// block via `loadBlocks`, exactly like the real Workflow runtime evaluates it). The orchestration
// code outside the blocks calls `agent`/`parallel`/`workflow`/`log`, which only exist inside a
// real Workflow run, so it is not exercised here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlocks } from '../../lib/pure-block.mjs';
import { parsePlanTasks } from '../../lib/plan-tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const workflowPath = path.join(here, '../../../workflows/feature-build.workflow.js');
const source = fs.readFileSync(workflowPath, 'utf8');
const {
  classifySize,
  reviewersFor,
  implementerBrief,
  faultBrief,
  gateBrief,
  isBlockedBy,
  splitScope,
  unpredicted,
} = loadBlocks(source, [
  'classifySize',
  'reviewersFor',
  'implementerBrief',
  'faultBrief',
  'gateBrief',
  'isBlockedBy',
  'splitScope',
  'unpredicted',
]);

const PLAN_4A = path.join(repoRoot, 'docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md');
const plan4aTasks = parsePlanTasks(fs.readFileSync(PLAN_4A, 'utf8'));
const TASK_2 = plan4aTasks.find((task) => task.id === '2');

describe('classifySize', () => {
  it('classifies Plan 4a Task 2 (2 non-test files) as small', () => {
    expect(classifySize(TASK_2)).toBe('small');
  });

  it('classifies a docs-only task as trivial', () => {
    expect(classifySize({ files: ['docs/testing.md'], testFiles: [] })).toBe('trivial');
  });

  it('classifies 3-6 non-test files as standard, and 7+ as large', () => {
    expect(classifySize({ files: ['a.ts', 'b.ts', 'c.ts'], testFiles: [] })).toBe('standard');
    expect(
      classifySize({
        files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
        testFiles: [],
      }),
    ).toBe('large');
  });
});

describe('reviewersFor', () => {
  it('assigns code-reviewer and consistency-reviewer for a small task', () => {
    expect(reviewersFor(TASK_2, 'small')).toEqual(['code-reviewer', 'consistency-reviewer']);
  });

  it('assigns no reviewers for a trivial (docs-only) task', () => {
    expect(reviewersFor({ files: ['docs/testing.md'] }, 'trivial')).toEqual([]);
  });

  it('adds typescript-reviewer, react-reviewer and silent-failure-hunter for a standard .tsx task', () => {
    const task = {
      files: ['apps/mobile/src/a.tsx', 'apps/mobile/src/b.ts', 'apps/mobile/src/c.ts'],
    };
    expect(reviewersFor(task, 'standard')).toEqual([
      'code-reviewer',
      'consistency-reviewer',
      'typescript-reviewer',
      'react-reviewer',
      'silent-failure-hunter',
    ]);
  });
});

describe('implementerBrief', () => {
  it('starts with RESET TO <attemptStart> when lastFailure is set', () => {
    const brief = implementerBrief(TASK_2, 'abc', { reasons: ['drift: x'] });
    expect(brief.startsWith('RESET TO abc')).toBe(true);
    expect(brief).toContain('drift: x');
  });

  it('never contains "dry-run", on a fresh attempt or a retry', () => {
    const fresh = implementerBrief(TASK_2, 'abc', null);
    const retry = implementerBrief(TASK_2, 'abc', {
      reasons: ['drift: x', 'tests-failed: exit 1', 'test: dry-run fault'],
    });
    expect(fresh.toLowerCase()).not.toContain('dry-run');
    // Even when a fault's own reason text mentions it, a real checkDrift reason never does --
    // the brief embeds only lastFailure.reasons, never testOutputTail or a fault's commit name.
    expect(retry).toContain('drift: x');
    expect(retry).toContain('tests-failed: exit 1');
  });

  it('does not start with RESET TO when there is no lastFailure', () => {
    expect(implementerBrief(TASK_2, 'abc', null).startsWith('RESET TO')).toBe(false);
  });
});

describe('faultBrief', () => {
  it('names the task\'s first test file for the "tests" fault', () => {
    expect(faultBrief('tests', TASK_2)).toContain('packages/engine/src/format.test.ts');
  });

  it('targets utilization.ts for the "drift" fault', () => {
    expect(faultBrief('drift', TASK_2)).toContain('packages/engine/src/utilization.ts');
  });
});

describe('gateBrief', () => {
  it('lists format.ts and format.test.ts after EXPECT:', () => {
    const brief = gateBrief(TASK_2, 'abc');
    const lines = brief.split('\n');
    expect(lines[0]).toBe('MODE: check abc');
    expect(lines[1]).toBe('TEST: pnpm --filter @credit-coach/engine test');
    expect(lines[2]).toBe(
      'EXPECT: packages/engine/src/format.ts packages/engine/src/format.test.ts',
    );
  });

  it('emits exactly 3 pinned lines, with TEST: none and EXPECT: none when absent', () => {
    const brief = gateBrief({ id: 'x', testCommand: null, createFiles: [], testFiles: [] }, 'abc');
    expect(brief.split('\n')).toEqual(['MODE: check abc', 'TEST: none', 'EXPECT: none']);
  });
});

describe('isBlockedBy', () => {
  it('is true when a dependency is in the escalated set', () => {
    expect(isBlockedBy({ dependsOn: ['1'] }, ['1'])).toBe(true);
  });

  it('is false when no dependency is escalated', () => {
    expect(isBlockedBy({ dependsOn: ['1'] }, ['2'])).toBe(false);
  });
});

describe('splitScope', () => {
  it('puts a finding outside the allowed files in outOfScope', () => {
    const result = splitScope(
      [{ file: 'packages/engine/src/utilization.ts' }],
      ['packages/engine/src/format.ts'],
    );
    expect(result.inScope).toEqual([]);
    expect(result.outOfScope).toEqual([{ file: 'packages/engine/src/utilization.ts' }]);
  });

  it('puts a finding inside the allowed files in inScope', () => {
    const finding = { file: 'packages/engine/src/format.ts' };
    const result = splitScope([finding], ['packages/engine/src/format.ts']);
    expect(result.inScope).toEqual([finding]);
    expect(result.outOfScope).toEqual([]);
  });
});

describe('unpredicted', () => {
  it('reports a changed file the implementer did not predict', () => {
    expect(unpredicted(['a.ts'], ['a.ts', 'b.ts'])).toEqual(['b.ts']);
  });

  it('is empty when every changed file was predicted', () => {
    expect(unpredicted(['a.ts', 'b.ts'], ['a.ts'])).toEqual([]);
  });
});
