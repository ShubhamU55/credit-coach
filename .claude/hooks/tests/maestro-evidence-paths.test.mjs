import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { MOBILE_APP_PATHSPEC, MOBILE_FILTER_GLOB } from '../lib/maestro-evidence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// Each git call starts a child process; on a loaded machine that exceeds the 5 s default.
const SPAWN_TIMEOUT_MS = 60_000;

// A throwaway repo that ignores the machine's core.autocrlf, so test output stays free of CRLF warnings.
function initRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir });
}

function commitFile(dir, relativePath, message) {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${message}\n`);
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git(['add', relativePath]);
  git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message]);
  return git(['rev-parse', 'HEAD']);
}

describe('maestro-evidence: what counts as a mobile change', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('ignores a Markdown-only commit under apps/mobile when finding the last mobile change', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-paths-'));
    initRepo(dir);
    const codeCommit = commitFile(dir, 'apps/mobile/src/screen.tsx', 'feat: code');
    commitFile(dir, 'apps/mobile/CLAUDE.md', 'docs: pointer');

    const last = execFileSync('git', ['log', '-1', '--format=%H', '--', ...MOBILE_APP_PATHSPEC], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

    expect(last).toBe(codeCommit);
  });

  it('ignores an agent-config commit under apps/mobile/.claude', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-paths-'));
    initRepo(dir);
    const codeCommit = commitFile(dir, 'apps/mobile/src/screen.tsx', 'feat: code');
    commitFile(dir, 'apps/mobile/.claude/settings.json', 'chore: settings');

    const last = execFileSync('git', ['log', '-1', '--format=%H', '--', ...MOBILE_APP_PATHSPEC], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

    expect(last).toBe(codeCommit);
  });

  it('still counts a non-Markdown file under apps/mobile', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-paths-'));
    initRepo(dir);
    commitFile(dir, 'apps/mobile/CLAUDE.md', 'docs: pointer');
    const configCommit = commitFile(dir, 'apps/mobile/app.json', 'chore: config');

    const last = execFileSync('git', ['log', '-1', '--format=%H', '--', ...MOBILE_APP_PATHSPEC], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

    expect(last).toBe(configCommit);
  });
});

describe('ci.yml: the mobile change filter matches the evidence gate', () => {
  it('uses the same Markdown-excluding glob as maestro-evidence', () => {
    const workflow = parse(
      fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8'),
    );
    const filterStep = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .find((step) => String(step.uses ?? '').startsWith('dorny/paths-filter'));
    const filters = parse(filterStep.with.filters);

    expect(filters.mobile).toEqual([MOBILE_FILTER_GLOB]);
  });
});
