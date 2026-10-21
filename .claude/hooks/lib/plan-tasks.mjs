// Parses the repo's implementation-plan markdown (docs/superpowers/plans/*.md) into tasks the
// feature-build workflow can drive: allowed files, files that must exist, the test command and
// the tasks each one consumes.

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   files: string[],
 *   createFiles: string[],
 *   testFiles: string[],
 *   testCommand: string | null,
 *   dependsOn: string[],
 *   text: string,
 * }} Task
 */

const TASK_HEADING = /^### Task ([\w-]+): (.+)$/;
const ANY_HEADING = /^#{1,3} /;
const FENCE = /^\s*(```|~~~)/;
const FILES_LABEL = /^\*\*Files:\*\*/;
const BOLD_LABEL = /^\*\*[^*]+:\*\*/;
const STEP_START = /^- \[[ xX]\]/;
const TOP_LEVEL_LABEL = /^[-*]\s+([A-Za-z]+)(?:\s*\([^)]*\))?:/;
const TOP_LEVEL_BULLET = /^[-*]\s/;
const BACKTICKED = /`([^`]+)`/g;
const PNPM_COMMAND = /`(pnpm [^`]+)`/;
const PASS_WORD = /\bPASS\b/;
const CONSUMES_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Consumes\b/;
const FILE_EXTENSION = /\.[A-Za-z0-9]+$/;
const MAX_RANGE_SPAN = 100;

// "Task 1", "Tasks 1–10", "Tasks 1, 2 and 3", or a prefixed id such as "W0-5" / "W4-1…4".
const TASK_REFERENCE =
  /\bTasks?\s+(\d+(?:\s*(?:–|—|…|-|to|,|and|&)\s*\d+)*)|\b([A-Z]+\d*)-(\d+)(?:\s*(?:–|—|…|\.\.\.)\s*(\d+))?/g;
const NUMBER_OR_RANGE = /(\d+)(?:\s*(?:–|—|…|-|to)\s*(\d+))?/g;

/**
 * A backticked token is a path if it has no spaces, isn't a package, isn't a directory (ends in
 * `/`, which could never match a changed file or exist as a blob at HEAD), and has `/` or an
 * extension.
 */
function isPath(token) {
  if (/\s/.test(token) || token.startsWith('@') || token.endsWith('/')) return false;
  return token.includes('/') || FILE_EXTENSION.test(token);
}

function unique(values) {
  return [...new Set(values)];
}

function backtickedPaths(line) {
  return [...line.matchAll(BACKTICKED)].map((match) => match[1]).filter(isPath);
}

/** `[from..to]` as strings, or just `[from]` when the range is absent, reversed or absurd. */
function expandRange(from, to) {
  const start = Number(from);
  const end = to === undefined ? start : Number(to);
  if (end < start || end - start > MAX_RANGE_SPAN) return [String(start)];
  return Array.from({ length: end - start + 1 }, (_, offset) => String(start + offset));
}

function referencedIds(line) {
  return [...line.matchAll(TASK_REFERENCE)].flatMap((match) => {
    if (match[1] !== undefined) {
      return [...match[1].matchAll(NUMBER_OR_RANGE)].flatMap((m) => expandRange(m[1], m[2]));
    }
    return expandRange(match[3], match[4]).map((n) => `${match[2]}-${n}`);
  });
}

/** Splits the plan into task sections, ignoring headings inside fenced code blocks. */
function splitSections(lines) {
  const sections = [];
  let current = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = inFence ? null : line.match(TASK_HEADING);

    if (heading) {
      current = { id: heading[1], title: heading[2].trim(), lines: [line] };
      sections.push(current);
    } else if (!inFence && ANY_HEADING.test(line)) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/** Reads the `**Files:**` block: nested bullets inherit the label of their top-level bullet. */
function parseFiles(lines) {
  const start = lines.findIndex((line) => FILES_LABEL.test(line));
  if (start === -1) return { files: [], createFiles: [], testFiles: [] };

  const entries = [];
  let label = null;
  for (const line of lines.slice(start + 1)) {
    if (BOLD_LABEL.test(line) || STEP_START.test(line) || ANY_HEADING.test(line)) break;
    // The label, including any parenthetical such as "Create (from ECC `scripts/hooks/`):",
    // is not an entry, so paths are read only after it.
    const labelMatch = TOP_LEVEL_BULLET.test(line) ? line.match(TOP_LEVEL_LABEL) : null;
    if (TOP_LEVEL_BULLET.test(line)) label = labelMatch ? labelMatch[1].toLowerCase() : null;
    const body = labelMatch ? line.slice(labelMatch[0].length) : line;
    entries.push(...backtickedPaths(body).map((path) => ({ label, path })));
  }

  const pathsWhere = (predicate) =>
    unique(entries.filter((entry) => predicate(entry.label)).map((entry) => entry.path));
  return {
    files: pathsWhere((l) => l !== 'test'),
    createFiles: pathsWhere((l) => l === 'create'),
    testFiles: pathsWhere((l) => l === 'test'),
  };
}

/** Groups `- [ ]` steps with their continuation lines. */
function splitSteps(lines) {
  const steps = [];
  for (const line of lines) {
    if (STEP_START.test(line)) steps.push([line]);
    else if (steps.length > 0) steps[steps.length - 1].push(line);
  }
  return steps.map((stepLines) => stepLines.join('\n'));
}

function parseTestCommand(lines) {
  for (const step of splitSteps(lines)) {
    if (!PASS_WORD.test(step)) continue;
    const match = step.match(PNPM_COMMAND);
    if (match) return match[1];
  }
  return null;
}

function parseDependsOn(lines, ownId, knownIds) {
  const ids = lines.filter((line) => CONSUMES_LINE.test(line)).flatMap(referencedIds);
  return unique(ids).filter((id) => id !== ownId && knownIds.has(id));
}

/**
 * Parses every `### Task <id>: <title>` section of a plan.
 *
 * @param {string} markdown
 * @returns {Task[]}
 */
export function parsePlanTasks(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const sections = splitSections(lines);
  const knownIds = new Set(sections.map((section) => section.id));

  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    ...parseFiles(section.lines),
    testCommand: parseTestCommand(section.lines),
    dependsOn: parseDependsOn(section.lines, section.id, knownIds),
    text: section.lines.join('\n').trimEnd(),
  }));
}
