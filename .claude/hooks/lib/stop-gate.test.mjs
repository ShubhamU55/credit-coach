import { describe, it, expect, vi } from 'vitest';
import { changedCodePaths, gatesFor, decideStop } from './stop-gate.mjs';

const TYPECHECK = { label: 'typecheck', command: 'pnpm', args: ['typecheck'] };
const HOOK_TESTS = {
  label: 'hook tests',
  command: 'pnpm',
  args: ['--filter', '@credit-coach/hooks', 'test'],
};

describe('changedCodePaths', () => {
  it('keeps paths under apps, packages, supabase and the hooks, and ignores docs', () => {
    const porcelain = [
      ' M apps/mobile/app/index.tsx',
      '?? packages/engine/src/new.ts',
      ' M supabase/config.toml',
      ' M .claude/hooks/lib/tidy.mjs',
      ' M docs/status.md',
      '?? .design/',
    ].join('\n');

    expect(changedCodePaths(porcelain)).toEqual([
      'apps/mobile/app/index.tsx',
      'packages/engine/src/new.ts',
      'supabase/config.toml',
      '.claude/hooks/lib/tidy.mjs',
    ]);
  });

  it('reads the new path of a rename and strips quotes', () => {
    const porcelain = 'R  old/name.ts -> apps/admin/new.ts\n M "apps/admin/with space.ts"';

    expect(changedCodePaths(porcelain)).toEqual(['apps/admin/new.ts', 'apps/admin/with space.ts']);
  });

  it('returns nothing for empty output', () => {
    expect(changedCodePaths('')).toEqual([]);
  });
});

describe('gatesFor', () => {
  it('needs no gate when no code changed', () => {
    expect(gatesFor([])).toEqual([]);
  });

  it('typechecks once when apps, packages or supabase changed', () => {
    expect(gatesFor(['apps/mobile/a.ts', 'packages/engine/b.ts'])).toEqual([TYPECHECK]);
  });

  it('runs the hook tests when the hooks changed', () => {
    expect(gatesFor(['.claude/hooks/lib/a.mjs'])).toEqual([HOOK_TESTS]);
  });

  it('runs both, typecheck first', () => {
    expect(gatesFor(['.claude/hooks/lib/a.mjs', 'apps/admin/b.ts'])).toEqual([
      TYPECHECK,
      HOOK_TESTS,
    ]);
  });
});

describe('decideStop', () => {
  const passing = () => ({ status: 0, output: 'ok' });

  it('never blocks, and runs nothing, when a stop hook already forced a continuation', () => {
    const run = vi.fn(passing);

    expect(decideStop({ stop_hook_active: true }, [TYPECHECK], run)).toEqual({ block: false });
    expect(run).not.toHaveBeenCalled();
  });

  it('does not block when there are no gates', () => {
    expect(decideStop({}, [], passing)).toEqual({ block: false });
  });

  it('does not block when every gate passes', () => {
    expect(decideStop({}, [TYPECHECK, HOOK_TESTS], passing)).toEqual({ block: false });
  });

  it('blocks on the first failing gate and names it with the tail of its output', () => {
    const lines = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');
    const run = vi.fn((gate) => (gate === TYPECHECK ? { status: 1, output: lines } : passing()));

    const decision = decideStop({}, [TYPECHECK, HOOK_TESTS], run);

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain('typecheck');
    expect(decision.reason).toContain('line 99');
    expect(decision.reason).not.toContain('line 10\n');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('treats a gate that produced no exit status (a timeout) as a failure', () => {
    const decision = decideStop({}, [TYPECHECK], () => ({ status: null, output: '' }));

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain('typecheck');
  });
});
