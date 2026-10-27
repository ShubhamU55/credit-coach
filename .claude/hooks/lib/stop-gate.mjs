// Pure logic for the Stop hook's done-gate: decide which checks the changed files need and
// whether a failing check should stop the agent from finishing. No I/O lives here.

const CODE_PREFIXES = ['apps/', 'packages/', 'supabase/', '.claude/hooks/'];
const HOOKS_PREFIX = '.claude/hooks/';
const REASON_TAIL_LINES = 30;

const TYPECHECK = { label: 'typecheck', command: 'pnpm', args: ['typecheck'] };
const HOOK_TESTS = {
  label: 'hook tests',
  command: 'pnpm',
  args: ['--filter', '@credit-coach/hooks', 'test'],
};

/** Paths from `git status --porcelain` that sit under a code directory (docs and scratch are ignored). */
export function changedCodePaths(porcelain) {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).split(' -> ').pop().trim().replace(/^"(.*)"$/, '$1'))
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => CODE_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

/** The checks the changed paths need: typecheck for app code, hook tests for the hooks, typecheck first. */
export function gatesFor(paths) {
  const touchesApps = paths.some((file) => !file.startsWith(HOOKS_PREFIX));
  const touchesHooks = paths.some((file) => file.startsWith(HOOKS_PREFIX));

  return [...(touchesApps ? [TYPECHECK] : []), ...(touchesHooks ? [HOOK_TESTS] : [])];
}

function tail(output) {
  return output.split('\n').slice(-REASON_TAIL_LINES).join('\n');
}

/**
 * Block the stop on the first failing gate. A stop hook that already forced a continuation
 * (`stop_hook_active`) is never blocked again, so a persistent failure cannot trap the agent.
 * A gate with no exit status (a timeout) counts as a failure.
 */
export function decideStop(input, gates, runGate) {
  if (input?.stop_hook_active) return { block: false };

  for (const gate of gates) {
    const { status, output } = runGate(gate);
    if (status !== 0) {
      return {
        block: true,
        reason: `The ${gate.label} gate failed, so the work is not done. Fix it before finishing:\n${tail(output)}`,
      };
    }
  }

  return { block: false };
}
