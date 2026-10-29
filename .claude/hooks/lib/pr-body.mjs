// Pure check for the pull request body: the PR template's `## AI-assisted` disclosure and a
// `pnpm verify` result line must be filled in. No I/O lives here.

const AI_SECTION = 'AI-assisted';
const EVIDENCE_SECTION = 'Test evidence';

const MISSING_AI_SECTION = '## AI-assisted section';
const MISSING_VERIFY = 'Test evidence: a pnpm verify result line';

const AI_FIELDS = [
  {
    label: /^\s*[-*]\s*Agents or commands used\s*:(.*)$/im,
    missing: 'AI-assisted: agents or commands used',
  },
  {
    label: /^\s*[-*]\s*Process journal entry or run ledger\s*:(.*)$/im,
    missing: 'AI-assisted: process journal entry or run ledger',
  },
];

const VERIFY_LINE = /pnpm verify[^:\n]*:(.*)$/gim;

/** A value is missing when it is empty or entirely one `<...>` placeholder. */
function isFilled(value) {
  const trimmed = value.trim();
  return trimmed !== '' && !/^<.*>$/.test(trimmed);
}

/** Map of lower-cased `## ` heading to the section text below it (HTML comments already removed). */
function sectionsOf(body) {
  const text = body.replaceAll('\r\n', '\n').replace(/<!--[\s\S]*?-->/g, '');
  const sections = new Map();
  for (const chunk of text.split(/^## /m).slice(1)) {
    const newline = chunk.indexOf('\n');
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim().toLowerCase();
    sections.set(heading, newline === -1 ? '' : chunk.slice(newline + 1));
  }
  return sections;
}

function hasVerifyResult(evidence) {
  return [...evidence.matchAll(VERIFY_LINE)].some(([, value]) => isFilled(value));
}

/**
 * @param {string | null | undefined} body the pull request description
 * @returns {{ ok: boolean, missing: string[] }} human-readable list of what is absent
 */
export function checkPrBody(body) {
  const sections = sectionsOf(typeof body === 'string' ? body : '');
  const missing = [];

  const evidence = sections.get(EVIDENCE_SECTION.toLowerCase());
  if (evidence === undefined || !hasVerifyResult(evidence)) missing.push(MISSING_VERIFY);

  const ai = sections.get(AI_SECTION.toLowerCase());
  if (ai === undefined) {
    missing.push(MISSING_AI_SECTION);
  } else {
    for (const { label, missing: item } of AI_FIELDS) {
      const match = ai.match(label);
      if (!match || !isFilled(match[1])) missing.push(item);
    }
  }

  return { ok: missing.length === 0, missing };
}
