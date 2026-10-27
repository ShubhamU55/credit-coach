// Pure janitor checks behind `/tidy` (spec §8.6): expired scratch items and docs that reference
// repo paths which no longer exist. Both only ever report; nothing here (or in bin/tidy.mjs)
// deletes anything, and "today" and the filesystem arrive as arguments.
import { parseScratchHeader, isExpired } from './scratch.mjs';

// First segments that mark a slash-containing token as a repo path even without a file extension.
const REPO_ROOTS = [
  'apps',
  'packages',
  'docs',
  'supabase',
  'scratch',
  '.claude',
  '.github',
  'scripts',
];
// Local-only or generated trees: absent from a clean checkout by design, never a stale reference.
const IGNORED_ROOTS = ['.superpowers', 'node_modules', 'dist', 'coverage', '.next'];

const BACKTICKED = /`([^`\n]+)`/g;
const PATH_SHAPE = /^\.?[\w@-][\w.@-]*(\/[\w.@-]+)+\/?$/;
const LINE_SUFFIX = /:\d+(-\d+)?$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Paths of the scratch items whose `expires` date is strictly before `todayIso`. A file with a
 * missing or invalid header is not "expired" -- `bin/scratch-expiry.mjs` already warns on those.
 *
 * @param {Array<{ path: string, text: string }>} files
 * @param {string} todayIso `YYYY-MM-DD`
 * @returns {string[]}
 */
export function listExpiredScratch(files, todayIso) {
  return files
    .filter(({ text }) => {
      const header = parseScratchHeader(text);
      return header !== null && isExpired(header, todayIso);
    })
    .map(({ path }) => path);
}

/** The lines of `text` outside fenced code blocks (an example in a fence is not a reference). */
function proseLines(text) {
  const lines = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(FENCE);
    if (fence === null && marker) {
      fence = marker[1][0];
    } else if (fence !== null && marker && marker[1][0] === fence) {
      fence = null;
    } else if (fence === null) {
      lines.push(line);
    }
  }
  return lines;
}

/** The repo-relative path a backticked token names, or null when it isn't a checkable path. */
function toRepoPath(token) {
  const cleaned = token
    .trim()
    .replace(/#.*$/, '')
    .replace(LINE_SUFFIX, '')
    .replace(/^(\.\/)+/, '')
    .replace(/\/$/, '');
  if (!PATH_SHAPE.test(cleaned) || cleaned.split('/').includes('..')) return null;
  const segments = cleaned.split('/');
  if (IGNORED_ROOTS.includes(segments[0])) return null;
  const hasExtension = /\.\w+$/.test(segments[segments.length - 1]);
  return hasExtension || REPO_ROOTS.includes(segments[0]) ? cleaned : null;
}

/**
 * Backticked repo paths in `docs` that `exists` says are gone, once per doc and path. Skips
 * placeholders (`<x>`), globs, URLs, commands, absolute and `..` paths, fenced code, and local-only
 * trees.
 *
 * @param {Array<{ path: string, text: string }>} docs
 * @param {(repoPath: string) => boolean} exists
 * @returns {Array<{ doc: string, ref: string }>}
 */
export function findStaleRefs(docs, exists) {
  return docs.flatMap(({ path: doc, text }) => {
    const refs = proseLines(text)
      .flatMap((line) => [...line.matchAll(BACKTICKED)].map((match) => toRepoPath(match[1])))
      .filter((ref) => ref !== null);
    return [...new Set(refs)].filter((ref) => !exists(ref)).map((ref) => ({ doc, ref }));
  });
}
