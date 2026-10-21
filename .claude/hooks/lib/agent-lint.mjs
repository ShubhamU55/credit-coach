/**
 * Pure helpers for linting `.claude/agents/*.md` files: frontmatter
 * parsing, §6 section-heading detection, and section body/first-line
 * extraction. Extracted out of `tests/agents-lint.test.mjs` so they can be
 * unit-tested on in-memory fixtures, not just the real agent roster.
 *
 * Heading detection and section-body/first-line extraction all ignore
 * fenced code blocks, via the shared CommonMark-respecting
 * `linesOutsideFences` (./markdown-fences.mjs): an agent file that only
 * has a required heading, or the required wording, inside a fenced
 * example must not satisfy the real structural checks.
 */
import { parse } from 'yaml';
import { linesOutsideFences } from './markdown-fences.mjs';

/** `text` with every fenced code block stripped out, lines rejoined with `\n`. */
function visibleText(text) {
  return linesOutsideFences(text)
    .map((line) => line.text)
    .join('\n');
}

/** Parses `---`-delimited YAML frontmatter from the top of a Markdown file. */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  return parse(match[1]) ?? {};
}

/** Returns the `## Heading` text of every top-level heading outside fenced code blocks, in file order. */
export function headingsOf(text) {
  return [...visibleText(text).matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].trim());
}

/**
 * Splits a frontmatter `tools` field into a list. Accepts a scalar
 * ("Read, Grep, Glob" or "Read Write" — comma- and/or whitespace-
 * separated) or a YAML list (`[Read, Grep]` / block form). Neither form
 * may fail open into an empty or partial list, or a Write-capable agent
 * could dodge the "Allowed paths: Nothing" and "Prompt Defense Baseline"
 * checks below.
 */
export function toolsListOf(frontmatter) {
  const raw = frontmatter?.tools;
  if (Array.isArray(raw)) {
    return raw.map((tool) => String(tool).trim()).filter(Boolean);
  }
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((tool) => tool.trim())
    .filter(Boolean);
}

/**
 * The body text of a `## Heading` section (outside fenced code blocks),
 * from just after the heading line up to the next `## ` heading or EOF.
 * `null` when the heading isn't found outside a fence — a heading that
 * only exists inside a fenced example does not count as a real section.
 */
export function bodyUnderHeading(text, heading) {
  const visible = visibleText(text);
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, 'm');
  const headingMatch = visible.match(headingRe);
  if (!headingMatch) return null;

  const rest = visible.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingMatch = rest.match(/\n##\s/);
  const bodyEnd = nextHeadingMatch ? nextHeadingMatch.index : rest.length;
  return rest.slice(0, bodyEnd);
}

/**
 * The first non-blank line of body text under a `## Heading` section
 * (outside fenced code blocks), bounded to that section. `null` when the
 * heading is absent (outside a fence) or its section has no non-blank
 * line before the next heading.
 */
export function firstLineUnderHeading(text, heading) {
  const body = bodyUnderHeading(text, heading);
  if (body === null) return null;
  const line = body.split('\n').find((l) => l.trim().length > 0);
  return line ?? null;
}

/** Tools that can change files; a read-only agent must declare none of them. */
export const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/** Roster agents (spec §5) that must never declare a write tool when their file exists. */
export const READ_ONLY_AGENTS = [
  'gate-checker',
  'finding-verifier',
  'consistency-reviewer',
  'functional-tester',
  'edge-case-hunter',
  'requirements-analyst',
  'domain-checker',
  'design-checker',
  'api-tester',
  'integration-tester',
  'pr-reviewer',
  'pr-test-analyzer',
  'pm-sync',
];

// List markers, blockquotes and emphasis that may wrap the "Nothing" of a read-only agent.
const LEADING_DECORATION = /^[-*+>\s]*[*_]*/;

/**
 * True when an "Allowed paths" first line declares that the agent writes nothing, ignoring
 * leading list markers, blockquotes and emphasis (`- Nothing`, `**Nothing**`).
 */
export function startsWithNothing(line) {
  return String(line).replace(LEADING_DECORATION, '').startsWith('Nothing');
}

/** True when the agent carries a real `## Prompt Defense Baseline` heading outside any fence. */
export function hasPromptDefenseBaseline(text) {
  return headingsOf(text).includes('Prompt Defense Baseline');
}

/**
 * Write-capable tools that a read-only agent still declares, each with the reason the agent
 * counts as read-only. Empty when the agent may write or declares no write tool.
 */
export function readOnlyViolations(name, text, frontmatter) {
  const firstLine = firstLineUnderHeading(text, 'Allowed paths');
  const reasons = [
    ...(READ_ONLY_AGENTS.includes(name) ? ['it is in READ_ONLY_AGENTS'] : []),
    ...(firstLine !== null && startsWithNothing(firstLine)
      ? ['"## Allowed paths" starts with "Nothing"']
      : []),
  ];
  if (reasons.length === 0) return [];
  const tools = toolsListOf(frontmatter);
  return WRITE_TOOLS.filter((tool) => tools.includes(tool)).map(
    (tool) => `${name}: ${reasons.join(' and ')} but "tools" lists "${tool}"`,
  );
}
