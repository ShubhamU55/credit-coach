import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlanTasks } from './plan-tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const PLAN_4A = 'docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md';
const PLAN_1C = 'docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md';

function readPlan(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function byId(tasks, id) {
  return tasks.find((task) => task.id === id);
}

describe('parsePlanTasks on Plan 4a', () => {
  const tasks = parsePlanTasks(readPlan(PLAN_4A));

  it('parses Task 2 files, test files and test command', () => {
    const task = byId(tasks, '2');
    expect(task.title).toBe('Formatters in the engine (pure, shared with admin)');
    expect(task.files).toEqual(['packages/engine/src/format.ts', 'packages/engine/src/index.ts']);
    expect(task.createFiles).toEqual(['packages/engine/src/format.ts']);
    expect(task.testFiles).toEqual(['packages/engine/src/format.test.ts']);
    expect(task.testCommand).toBe('pnpm --filter @credit-coach/engine test');
    expect(task.dependsOn).toEqual([]);
    expect(task.text.startsWith('### Task 2: Formatters')).toBe(true);
    expect(task.text).not.toContain('### Task 3');
  });

  it('maps a trailing-slash directory to dir/** in files only (Task 11)', () => {
    const task = byId(tasks, '11');
    expect(task.files).toContain('docs/test-reports/ui-kit/**');
    expect(task.createFiles).toEqual([
      'apps/mobile/src/ui/index.ts',
      'apps/mobile/src/kit/KitGallery.tsx',
      'apps/mobile/.maestro/kit-gallery.yaml',
    ]);
    expect(task.createFiles.some((p) => p.includes('*') || p.endsWith('/'))).toBe(false);
    expect(task.testFiles.some((p) => p.includes('*') || p.endsWith('/'))).toBe(false);
  });

  it('reads dependsOn from Consumes lines, expanding ranges', () => {
    expect(byId(tasks, '3').dependsOn).toEqual(['1']);
    const last = tasks.find((task) => task.text.includes('everything from Tasks 1–10'));
    expect(last.dependsOn).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });
});

describe('parsePlanTasks on Plan 1c', () => {
  const tasks = parsePlanTasks(readPlan(PLAN_1C));
  const ids = tasks.map((task) => task.id);

  it('finds every wave task id', () => {
    expect(ids).toContain('W0-1');
    expect(ids).toContain('W5-2');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops nested notes that are not paths (W0-1)', () => {
    expect(byId(tasks, 'W0-1').files).toEqual([
      'packages/engine/package.json',
      'packages/engine/vitest.config.ts',
      '.claude/hooks/package.json',
      'pnpm-lock.yaml',
    ]);
  });

  it('lets nested bullets inherit their label (W0-6, W2-1)', () => {
    const w06 = byId(tasks, 'W0-6');
    expect(w06.createFiles).toEqual([
      '.claude/hooks/lib/contracts.mjs',
      '.claude/hooks/lib/pure-block.mjs',
      '.claude/hooks/lib/plan-tasks.mjs',
      '.claude/hooks/bin/plan-tasks.mjs',
    ]);
    expect(w06.files).toEqual(w06.createFiles);
    expect(w06.testFiles).toEqual([
      '.claude/hooks/lib/contracts.test.mjs',
      '.claude/hooks/lib/pure-block.test.mjs',
      '.claude/hooks/lib/plan-tasks.test.mjs',
      '.claude/hooks/tests/workflows-sync.test.mjs',
    ]);
    expect(w06.testCommand).toBe('pnpm --filter @credit-coach/hooks test');

    const w21 = byId(tasks, 'W2-1');
    expect(w21.createFiles).toEqual([
      '.claude/workflows/feature-build.workflow.js',
      '.claude/workflows/qa.workflow.js',
      '.claude/commands/build.md',
      '.claude/commands/qa.md',
    ]);
    expect(w21.testFiles).toEqual([
      '.claude/hooks/tests/workflows/feature-build.test.mjs',
      '.claude/hooks/tests/workflows/qa.test.mjs',
    ]);
    expect(w21.dependsOn).toEqual(['W0-6']);
  });

  it('keeps Delete: paths in files but not createFiles (W1-1)', () => {
    const task = byId(tasks, 'W1-1');
    expect(task.files).toContain('.claude/agents/tdd-guide.md');
    expect(task.files).toContain('CLAUDE.md');
    expect(task.createFiles).not.toContain('.claude/agents/tdd-guide.md');
  });

  it('ignores backticked text inside a label parenthetical (W1-4)', () => {
    const task = byId(tasks, 'W1-4');
    expect(task.files).not.toContain('scripts/hooks/');
    expect(task.createFiles).toContain('.claude/hooks/block-no-verify.cjs');
  });

  it('never puts a bare directory token or a glob in createFiles (W0-4)', () => {
    const task = byId(tasks, 'W0-4');
    expect(task.createFiles.filter((p) => p.endsWith('/') || p.includes('*'))).toEqual([]);
    expect(task.files.filter((p) => p.endsWith('/'))).toEqual([]);
    expect(task.createFiles).toContain('.claude/rules/agents.md');
  });

  it('reads W-style ids and ranges from Consumes lines', () => {
    expect(byId(tasks, 'W0-7').dependsOn).toEqual(['W0-5']);
    expect(byId(tasks, 'W1-2').dependsOn).toEqual(['W0-6', 'W0-3']);
    expect(byId(tasks, 'W4-5').dependsOn).toEqual(['W2-1', 'W4-1', 'W4-2', 'W4-3', 'W4-4']);
  });
});

describe('parsePlanTasks on inline markdown', () => {
  it('returns [] for a plan with no tasks', () => {
    expect(parsePlanTasks('# Nothing here\n')).toEqual([]);
  });

  it('keeps a directory under a Test: label out of testFiles (the EXPECT list)', () => {
    const [task] = parsePlanTasks(
      [
        '### Task 1: Dirs',
        '',
        '**Files:**',
        '- Create: `src/a.ts`, `out/shots/`',
        '- Test: `src/a.test.ts`, `tests/fixtures/`',
        '',
        '- [ ] **Step 1:** Do it.',
      ].join('\n'),
    );
    expect(task.files).toEqual(['src/a.ts', 'out/shots/**', 'tests/fixtures/**']);
    expect(task.createFiles).toEqual(['src/a.ts']);
    expect(task.testFiles).toEqual(['src/a.test.ts']);
  });

  it('reproduces: a directory token that would widen files to everything is ignored', () => {
    const [task] = parsePlanTasks(
      [
        '### Task 1: Wide dirs',
        '',
        '**Files:**',
        '- Modify: `src/a.ts`, `./`, `**/`, `src/*/`, `../outside/`, `/abs/`, `./docs/`',
        '',
        '- [ ] **Step 1:** Do it.',
      ].join('\n'),
    );
    expect(task.files).toEqual(['src/a.ts', './docs/**']);
  });

  it('rejects a root-anchored glob entirely, never widening files (W2-1)', () => {
    const [task] = parsePlanTasks(
      [
        '### Task 1: Wide glob',
        '',
        '**Files:**',
        '- Modify: `src/a.ts`, `**/*`, `**/*.ts`, `*.ts`, `./**/*.ts`',
        '',
        '- [ ] **Step 1:** Do it.',
      ].join('\n'),
    );
    expect(task.files).toEqual(['src/a.ts']);
  });

  it('rejects the leading-character-check bypass strings (W2-1 fix round 1 / finding F)', () => {
    const [task] = parsePlanTasks(
      [
        '### Task 1: Bypass attempt',
        '',
        '**Files:**',
        '- Modify: `src/a.ts`, `.*/**`, `s*/**`, `/**`, `../**`',
        '',
        '- [ ] **Step 1:** Do it.',
      ].join('\n'),
    );
    expect(task.files).toEqual(['src/a.ts']);
  });

  it('keeps a scoped (non-root-anchored) glob in files but never in createFiles/testFiles (W2-1)', () => {
    const [task] = parsePlanTasks(
      [
        '### Task 1: Scoped glob',
        '',
        '**Files:**',
        '- Create: `src/a.ts`',
        '- Test: `src/*.test.ts`, `apps/mobile/**/*.tsx`',
        '',
        '- [ ] **Step 1:** Do it.',
      ].join('\n'),
    );
    expect(task.files).toEqual(['src/a.ts', 'src/*.test.ts', 'apps/mobile/**/*.tsx']);
    expect(task.createFiles).toEqual(['src/a.ts']);
    expect(task.testFiles).toEqual([]);
  });

  it('reproduces: a stray ~~~ inside a ``` fence does not expose a fenced task heading', () => {
    const tasks = parsePlanTasks(
      [
        '### Task 1: Real',
        '',
        '```markdown',
        '~~~',
        '### Task 2: Fake, inside the fence',
        '```',
        '',
        '### Task 3: Also real',
      ].join('\n'),
    );
    expect(tasks.map((task) => task.id)).toEqual(['1', '3']);
    expect(tasks[0].text).toContain('### Task 2: Fake, inside the fence');
  });

  it('reproduces: a longer fence is not closed by a shorter run inside it', () => {
    const tasks = parsePlanTasks(
      ['### Task 1: Real', '````md', '```', '### Task 2: Fake', '```', '````', '## Next'].join(
        '\n',
      ),
    );
    expect(tasks.map((task) => task.id)).toEqual(['1']);
  });

  it('gives a task without Files or a PASS step empty lists and a null command', () => {
    const [task] = parsePlanTasks('### Task 9: Lone\n\n- [ ] **Step 1:** Think.\n');
    expect(task).toMatchObject({
      id: '9',
      title: 'Lone',
      files: [],
      createFiles: [],
      testFiles: [],
      testCommand: null,
      dependsOn: [],
    });
  });
});

describe('bin/plan-tasks.mjs', () => {
  const bin = path.join(repoRoot, '.claude/hooks/bin/plan-tasks.mjs');

  it('prints the selected tasks as JSON', () => {
    const out = execFileSync(process.execPath, [bin, PLAN_4A, '2'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const tasks = JSON.parse(out);
    expect(tasks.map((task) => task.id)).toEqual(['2']);
    expect(tasks[0].testFiles).toEqual(['packages/engine/src/format.test.ts']);
  });

  it('exits non-zero on an unknown id', () => {
    expect(() =>
      execFileSync(process.execPath, [bin, PLAN_4A, 'nope'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).toThrow(/nope/);
  });
});
