#!/usr/bin/env node
// Adapted from affaan-m/ECC (MIT) @ 90606c8 (scripts/worktree-lifecycle.js + lib/worktree-lifecycle/{git,lifecycle}.js)
//
// `/worktrees`: a read-only report on this repo's git worktrees (spec §8.5, one ticket = one
// branch = one worktree): which are merged, stale or dirty, and which pairs of active ticket
// branches would conflict if merged, predicted with `git merge-tree --write-tree` (Git >= 2.38),
// which never touches a working tree or the index. Nothing is removed, merged or modified.
//
// Differences from the ECC original: conflicts are predicted between every pair of active ticket
// branches (not just each branch against the base); a merge-tree failure other than "conflicts" is
// reported as unknown, never as "no conflict"; the legacy merge-tree fallback, `--cleanup-plan` and
// the injectable runner are dropped; git runs via execFileSync with argument arrays, so no branch
// or path name is ever interpolated into a shell.
//
// Usage: node .claude/hooks/bin/worktrees.cjs [--base main] [--stale-days 7] [--repo <path>] [--json]
'use strict';

const { execFileSync } = require('node:child_process');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_DAYS = 7;
const GIT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
// If inherited (e.g. when run from a git hook) these would point git at the host repo, not `cwd`.
const INHERITED_GIT_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
];

function hermeticEnv() {
  const env = { ...process.env };
  for (const key of INHERITED_GIT_ENV) delete env[key];
  return env;
}

/** Runs git with an argument array. Never throws: a non-zero exit is returned as `status`. */
function git(cwd, args) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      env: hermeticEnv(),
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : -1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? error.message ?? ''),
    };
  }
}

/** `git worktree list --porcelain` -> [{ path, branch, head, detached }] */
function parseWorktreeList(porcelain) {
  const worktrees = [];
  let current = null;
  for (const raw of porcelain.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null, head: null, detached: false };
      worktrees.push(current);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current && line === 'detached') {
      current.detached = true;
    }
  }
  return worktrees;
}

/**
 * Predicts the merge of `left` and `right` (full refs) without touching any tree. Exit 0 = clean,
 * exit 1 = conflicts (the output is the merged tree id, then one conflicted path per line, up to
 * the first blank line), anything else = unknown, never "clean".
 */
function predictConflict(repoRoot, left, right) {
  const result = git(repoRoot, [
    'merge-tree',
    '--write-tree',
    '--name-only',
    '--no-messages',
    left,
    right,
  ]);
  if (result.status === 0) return { outcome: 'clean', files: [] };
  if (result.status === 1) {
    const [, ...rest] = result.stdout.split('\n');
    const blank = rest.findIndex((line) => line.trim() === '');
    const files = (blank < 0 ? rest : rest.slice(0, blank))
      .map((line) => line.trim())
      .filter(Boolean);
    return { outcome: 'conflict', files };
  }
  const reason = result.stderr.trim().split('\n')[0] || `git exited ${result.status}`;
  return { outcome: 'unknown', files: [], error: reason };
}

function classify(facts, staleMs, nowMs) {
  if (facts.isBase) return 'base';
  if (facts.detached || !facts.branch) return 'detached';
  if (facts.ahead === null) return 'unknown';
  if (facts.ahead === 0) return 'merged';
  const quietFor = facts.lastCommitMs === null ? null : nowMs - facts.lastCommitMs;
  return quietFor !== null && quietFor > staleMs ? 'stale' : 'active';
}

function inspectWorktree(repoRoot, worktree, options, nowMs) {
  const { baseBranch, staleMs } = options;
  const isBase = worktree.branch === baseBranch;
  const ref = worktree.branch ? `refs/heads/${worktree.branch}` : null;

  const status = git(worktree.path, ['status', '--porcelain']);
  const counts =
    ref && !isBase
      ? git(repoRoot, ['rev-list', '--left-right', '--count', `refs/heads/${baseBranch}...${ref}`])
      : null;
  const match =
    counts && counts.status === 0 ? counts.stdout.trim().match(/^(\d+)\s+(\d+)$/) : null;
  const lastCommit = ref ? git(repoRoot, ['log', '-1', '--format=%ct', ref]) : null;
  const seconds = lastCommit && lastCommit.status === 0 ? Number(lastCommit.stdout.trim()) : NaN;

  const facts = {
    isBase,
    branch: worktree.branch,
    detached: worktree.detached,
    ahead: match ? Number(match[2]) : null,
    behind: match ? Number(match[1]) : null,
    lastCommitMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
  };
  return {
    path: worktree.path,
    branch: worktree.branch,
    state: classify(facts, staleMs, nowMs),
    dirty: status.status === 0 ? status.stdout.trim() !== '' : null,
    ahead: facts.ahead,
    behind: facts.behind,
    ageDays: facts.lastCommitMs === null ? null : Math.floor((nowMs - facts.lastCommitMs) / DAY_MS),
  };
}

function isSafeRef(name) {
  return typeof name === 'string' && name !== '' && !name.startsWith('-');
}

/** Builds the full report: per-worktree state plus predicted conflicts for the active branches. */
function buildReport(repoRoot, options, nowMs) {
  const list = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (list.status !== 0) {
    throw new Error(`git worktree list failed: ${list.stderr.trim() || `exit ${list.status}`}`);
  }
  const worktrees = parseWorktreeList(list.stdout)
    .filter((worktree) => worktree.branch === null || isSafeRef(worktree.branch))
    .map((worktree) => inspectWorktree(repoRoot, worktree, options, nowMs));

  // A branch with commits the base lacks can conflict; merged branches have nothing to merge.
  const unmerged = worktrees.filter(
    (w) => w.branch && (w.state === 'active' || w.state === 'stale'),
  );
  const base = `refs/heads/${options.baseBranch}`;
  const againstBase = unmerged.map((w) => ({
    branch: w.branch,
    ...predictConflict(repoRoot, base, `refs/heads/${w.branch}`),
  }));
  const between = unmerged.flatMap((a, i) =>
    unmerged.slice(i + 1).map((b) => ({
      branches: [a.branch, b.branch],
      ...predictConflict(repoRoot, `refs/heads/${a.branch}`, `refs/heads/${b.branch}`),
    })),
  );

  return {
    baseBranch: options.baseBranch,
    staleDays: options.staleMs / DAY_MS,
    note: 'Read-only. Conflicts are predicted from committed tips; uncommitted changes are not considered.',
    worktrees,
    conflicts: {
      againstBase: againstBase.filter((c) => c.outcome !== 'clean'),
      between: between.filter((c) => c.outcome !== 'clean'),
    },
  };
}

function formatReport(report) {
  const lines = [`Worktrees (base: ${report.baseBranch}, stale after ${report.staleDays}d)`];
  for (const w of report.worktrees) {
    const counts = w.ahead === null ? '' : `  +${w.ahead}/-${w.behind}`;
    const age = w.ageDays === null ? '' : `  ${w.ageDays}d`;
    const dirty = w.dirty ? '  DIRTY' : w.dirty === null ? '  dirty=unknown' : '';
    lines.push(
      `  ${(w.branch || '(detached)').padEnd(34)} ${w.state}${counts}${age}${dirty}  ${w.path}`,
    );
  }
  lines.push('', 'Predicted conflicts');
  const { againstBase, between } = report.conflicts;
  if (againstBase.length + between.length === 0) lines.push('  none');
  for (const c of againstBase) {
    lines.push(`  ${c.branch} vs ${report.baseBranch}: ${describeOutcome(c)}`);
  }
  for (const c of between) lines.push(`  ${c.branches.join(' vs ')}: ${describeOutcome(c)}`);
  return lines.join('\n');
}

function describeOutcome(c) {
  if (c.outcome === 'unknown') return `UNKNOWN (${c.error})`;
  return `CONFLICT in ${c.files.join(', ') || '(paths not reported)'}`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    baseBranch: 'main',
    staleMs: DEFAULT_STALE_DAYS * DAY_MS,
    repoRoot: process.cwd(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--base') options.baseBranch = argv[++i];
    else if (arg === '--repo') options.repoRoot = argv[++i];
    else if (arg === '--stale-days') {
      const days = Number(argv[++i]);
      if (!Number.isFinite(days) || days < 0) throw new Error('--stale-days needs a number >= 0');
      options.staleMs = days * DAY_MS;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!isSafeRef(options.baseBranch)) throw new Error('--base needs a branch name');
  if (!options.repoRoot) throw new Error('--repo needs a path');
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const report = buildReport(options.repoRoot, options, Date.now());
  console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`worktrees: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

module.exports = {
  parseWorktreeList,
  predictConflict,
  classify,
  buildReport,
  formatReport,
  parseArgs,
};
