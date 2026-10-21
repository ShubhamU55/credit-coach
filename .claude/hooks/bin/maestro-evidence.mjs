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

function listReportFiles() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && REPORT_NAME_PATTERN.test(entry.name))
    .map((entry) => path.join(REPORTS_DIR, entry.name))
    .sort();
}

function loadReports(lastMobileCommit) {
  return listReportFiles().map((filePath) => {
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
