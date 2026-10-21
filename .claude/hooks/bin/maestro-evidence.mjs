#!/usr/bin/env node
// CI gate: fails unless the newest Maestro report reachable from the last
// apps/mobile change (by git ancestry, not file timestamps) passed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkMaestroEvidence } from '../lib/maestro-evidence.mjs';

// The maestro-android-e2e skill has flows write evidence to
// docs/test-reports/maestro-<date>.xml (outside apps/mobile, so the report
// commit itself never counts as "the last apps/mobile change").
const REPORTS_DIR = process.env.MAESTRO_REPORTS_DIR
  ? path.resolve(process.env.MAESTRO_REPORTS_DIR)
  : path.resolve(process.cwd(), 'docs/test-reports');
const REPORT_NAME_PATTERN = /^maestro-.*\.xml$/i;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The sha of the most recent commit that touched `pathspec`, or '' if none. */
function lastCommitTouching(pathspec) {
  try {
    return git(['log', '-1', '--format=%H', '--', pathspec]);
  } catch {
    return '';
  }
}

/** True when `ancestorSha` is an ancestor of (or equal to) `descendantSha`. */
function isAncestor(ancestorSha, descendantSha) {
  if (!ancestorSha || !descendantSha) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorSha, descendantSha]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every commit reachable from HEAD, oldest first, in ancestry (topological)
 * order rather than committer-date order — a rebase rewrites committer
 * dates, so date order can misplace a commit relative to its real ancestry.
 */
function fullHistoryOldestFirst() {
  try {
    return git(['log', '--topo-order', '--reverse', '--format=%H']).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function listReportFiles() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REPORT_NAME_PATTERN.test(entry.name))
    .map((entry) => path.join(REPORTS_DIR, entry.name));
}

/**
 * Orders report files by the position of the commit that last touched each
 * one, oldest first — not by filename, which mis-orders non-ISO names or a
 * `-2` suffix. A file with no matching commit (e.g. untracked locally) sorts
 * last, as the freshest possible evidence.
 */
function sortByCommitOrder(filePaths, history) {
  return [...filePaths]
    .map((filePath) => ({ filePath, commit: lastCommitTouching(filePath) }))
    .sort((a, b) => {
      const indexA = history.indexOf(a.commit);
      const indexB = history.indexOf(b.commit);
      return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
    })
    .map((entry) => entry.filePath);
}

function loadReports(lastMobileCommit) {
  const history = fullHistoryOldestFirst();
  const orderedFiles = sortByCommitOrder(listReportFiles(), history);

  return orderedFiles.map((filePath) => {
    const reportCommit = lastCommitTouching(filePath);
    return {
      path: filePath,
      xml: fs.readFileSync(filePath, 'utf8'),
      afterLastMobileChange: isAncestor(lastMobileCommit, reportCommit),
    };
  });
}

function main() {
  const lastMobileCommit = lastCommitTouching('apps/mobile');
  const reports = loadReports(lastMobileCommit);
  const result = checkMaestroEvidence({ reports });

  if (!result.ok) {
    console.error(`Maestro evidence check failed: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Maestro evidence check passed: ${result.reason}`);
}

main();
