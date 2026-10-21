#!/usr/bin/env node
// Warns about missing/expired scratch/ headers without ever failing the build (§8.6).
import fs from 'node:fs';
import path from 'node:path';
import { parseScratchHeader, isExpired } from '../lib/scratch.mjs';

const SCRATCH_DIR = path.resolve(process.cwd(), 'scratch');

function listScratchFiles() {
  if (!fs.existsSync(SCRATCH_DIR)) return [];
  return (
    fs
      .readdirSync(SCRATCH_DIR, { withFileTypes: true })
      // Dotfiles (.gitkeep, .gitignore, …) aren't scratch items and never carry a header.
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => path.join(SCRATCH_DIR, entry.name))
  );
}

function warn(message) {
  console.log(`::warning::${message}`);
}

/** Returns true when the file is expired, or has no valid §8.6 header at all. */
function checkFile(filePath, todayIso) {
  const header = parseScratchHeader(fs.readFileSync(filePath, 'utf8'));

  if (!header) {
    warn(`${filePath} has no valid scratch header (purpose/owner/created/expires required)`);
    return true;
  }

  if (!isExpired(header, todayIso)) return false;

  warn(
    `${filePath} expired on ${header.expires} (owner: ${header.owner}, keep-if: ${header.keepIf ?? 'n/a'}) — delete it or make it permanent`,
  );
  return true;
}

function main() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const flaggedCount = listScratchFiles().filter((filePath) =>
    checkFile(filePath, todayIso),
  ).length;

  if (flaggedCount > 0) {
    warn(`${flaggedCount} scratch/ item(s) need attention; review and delete or promote them`);
  }

  // Always succeeds: this is an advisory check, never a merge blocker.
  process.exitCode = 0;
}

main();
