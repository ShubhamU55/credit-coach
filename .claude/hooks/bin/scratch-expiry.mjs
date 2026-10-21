#!/usr/bin/env node
// Warns about missing/expired scratch/** headers without ever failing the
// build (spec §8.6: "CI warns on expired items, never fails").
import fs from 'node:fs';
import path from 'node:path';
import { parseScratchHeader, isExpired } from '../lib/scratch.mjs';

const SCRATCH_DIR = path.resolve(process.cwd(), 'scratch');
const README_PATH = path.join(SCRATCH_DIR, 'README.md');

/** Recursively lists scratch/** files, skipping dotfiles/dotdirs and the W0-7 README. */
function listScratchFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listScratchFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (fullPath === README_PATH) continue;

    results.push(fullPath);
  }

  return results;
}

function warn(message) {
  console.log(`::warning::${message}`);
}

/** Returns true when the file is expired, unparseable, or unreadable. */
function checkFile(filePath, todayIso) {
  try {
    const header = parseScratchHeader(fs.readFileSync(filePath, 'utf8'));

    if (!header) {
      warn(
        `${filePath} has no valid scratch header (purpose/owner/created/expires required, dates as YYYY-MM-DD)`,
      );
      return true;
    }

    if (!isExpired(header, todayIso)) return false;

    warn(
      `${filePath} expired on ${header.expires} (owner: ${header.owner}, keep-if: ${header.keepIf ?? 'n/a'}) — delete it or make it permanent`,
    );
    return true;
  } catch (error) {
    warn(
      `${filePath} could not be checked: ${error instanceof Error ? error.message : String(error)}`,
    );
    return true;
  }
}

function run() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const flaggedCount = listScratchFiles(SCRATCH_DIR).filter((filePath) =>
    checkFile(filePath, todayIso),
  ).length;

  if (flaggedCount > 0) {
    warn(`${flaggedCount} scratch/ item(s) need attention; review and delete or promote them`);
  }
}

try {
  run();
} catch (error) {
  // Advisory check: never let an unexpected failure here fail the build.
  warn(
    `scratch-expiry check failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
  );
}
