#!/usr/bin/env node
// `/tidy`'s janitor scan (spec §8.6): prints, as JSON, the expired scratch items and the docs that
// reference repo paths which no longer exist. It only ever reports -- it never deletes, moves or
// edits anything; the owner approves and removes items in a normal commit.
// Usage: node .claude/hooks/bin/tidy.mjs [--today YYYY-MM-DD]   (run from the repo root)
import fs from 'node:fs';
import path from 'node:path';
import { listExpiredScratch, findStaleRefs } from '../lib/tidy.mjs';

const ROOT = process.cwd();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Living docs only. Plans, specs, ledgers, the journal and test reports are history: they name
// files that were later renamed or removed, and that is not drift.
const LIVING_FILES = ['CLAUDE.md', 'README.md'];
const LIVING_DIRS = [
  { dir: 'docs', recursive: false },
  { dir: 'docs/adr', recursive: true },
  { dir: '.claude/rules', recursive: true },
  { dir: '.claude/commands', recursive: true },
];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** Recursively (or not) lists files under `dir` with the given suffix, skipping dot-entries. */
function listFiles(dir, recursive, suffix) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return recursive ? listFiles(relative, recursive, suffix) : [];
    return entry.isFile() && entry.name.endsWith(suffix) ? [relative] : [];
  });
}

/** Reads each file; a file that can't be read is reported, never skipped silently. */
function readAll(paths) {
  const files = [];
  const unreadable = [];
  for (const relative of paths) {
    try {
      files.push({ path: relative, text: fs.readFileSync(path.join(ROOT, relative), 'utf8') });
    } catch (error) {
      unreadable.push({
        path: relative,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { files, unreadable };
}

function parseToday(argv) {
  const index = argv.indexOf('--today');
  if (index < 0) return new Date().toISOString().slice(0, 10);
  const value = argv[index + 1];
  if (!ISO_DATE.test(value ?? '')) throw new Error('--today must be a YYYY-MM-DD date');
  return value;
}

function run() {
  const today = parseToday(process.argv.slice(2));

  // scratch/README.md documents the header format with a worked example; it is never a temp file.
  const scratchPaths = listFiles('scratch', true, '').filter((p) => p !== 'scratch/README.md');
  const scratch = readAll(scratchPaths);

  const docPaths = [
    ...LIVING_FILES.filter((p) => fs.existsSync(path.join(ROOT, p))),
    ...LIVING_DIRS.flatMap(({ dir, recursive }) => listFiles(dir, recursive, '.md')),
  ];
  const docs = readAll(docPaths);

  const report = {
    today,
    note: 'Proposals only: nothing was deleted. Remove expired scratch items in a normal commit (chore(scratch): remove expired <name>).',
    expiredScratch: listExpiredScratch(scratch.files, today),
    staleRefs: findStaleRefs(docs.files, (ref) => fs.existsSync(path.join(ROOT, toPosix(ref)))),
    unreadable: [...scratch.unreadable, ...docs.unreadable],
  };
  console.log(JSON.stringify(report, null, 2));
}

try {
  run();
} catch (error) {
  console.error(`tidy: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
