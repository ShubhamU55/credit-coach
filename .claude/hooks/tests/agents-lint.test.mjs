import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter,
  toolsListOf,
  headingsOf,
  firstLineUnderHeading,
  bodyUnderHeading,
} from '../lib/agent-lint.mjs';

// Agent roster (spec §6 preamble). Every later agent file must pass these
// checks, so failure messages below always name the file and the rule broken.
const LEGACY = [
  'code-reviewer',
  'typescript-reviewer',
  'react-reviewer',
  'silent-failure-hunter',
  'planner',
  'security-reviewer',
  'tdd-guide', // retired in W1-1
];
const BUILDERS = ['implementer', 'test-automator', 'build-error-resolver'];
const MODEL_TIERS = ['haiku', 'sonnet', 'opus'];
const SECTION_ORDER = [
  'Mission',
  'Inputs',
  'Allowed paths',
  'Procedure',
  'Output contract',
  'Stop rules',
  'Anti-drift',
];
const ATTRIBUTION_LINE = '<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->';
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const agentsDir = path.join(repoRoot, '.claude/agents');

function listAgentFiles() {
  return fs
    .readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(agentsDir, name))
    .sort();
}

describe('agent lint (.claude/agents/*.md)', () => {
  for (const filePath of listAgentFiles()) {
    const file = path.basename(filePath);
    const base = path.basename(filePath, '.md');
    const text = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(text);
    const isLegacy = LEGACY.includes(base);
    const isBuilder = BUILDERS.includes(base);

    it(`${file}: frontmatter has name=${base}, description, tools, and model in {haiku,sonnet,opus}`, () => {
      expect(frontmatter, `${file}: missing or malformed frontmatter`).toBeTruthy();
      expect(
        frontmatter.name,
        `${file}: frontmatter "name" must equal the filename ("${base}")`,
      ).toBe(base);
      expect(frontmatter.description, `${file}: frontmatter is missing "description"`).toBeTruthy();
      expect(frontmatter.tools, `${file}: frontmatter is missing "tools"`).toBeTruthy();
      expect(
        MODEL_TIERS,
        `${file}: frontmatter "model" must be one of ${MODEL_TIERS.join('/')}, got "${frontmatter.model}"`,
      ).toContain(frontmatter.model);
    });

    if (!isLegacy) {
      it(`${file}: has the 7 §6 headings in order (non-legacy agent)`, () => {
        const headings = headingsOf(text).filter((h) => SECTION_ORDER.includes(h));
        expect(
          headings,
          `${file}: §6 headings must appear in order: ${SECTION_ORDER.join(' > ')}`,
        ).toEqual(SECTION_ORDER);
      });
    }

    it(`${file}: "Allowed paths" starting with "Nothing" implies no Write/Edit/MultiEdit/NotebookEdit tool`, () => {
      const firstLine = firstLineUnderHeading(text, 'Allowed paths');
      if (firstLine === null || !firstLine.trim().startsWith('Nothing')) return;

      const tools = toolsListOf(frontmatter);
      for (const forbidden of WRITE_TOOLS) {
        expect(
          tools,
          `${file}: "## Allowed paths" starts with "Nothing" but "tools" still lists "${forbidden}"`,
        ).not.toContain(forbidden);
      }
    });

    it(`${file}: mentioning affaan-m/ECC carries the exact attribution line`, () => {
      if (!text.includes('affaan-m/ECC')) return;
      expect(
        text,
        `${file}: mentions "affaan-m/ECC" without the exact attribution line (${ATTRIBUTION_LINE})`,
      ).toContain(ATTRIBUTION_LINE);
    });

    it(`${file}: "## Prompt Defense Baseline" is required without Write/Edit, forbidden for BUILDERS`, () => {
      const tools = toolsListOf(frontmatter);
      const hasWriteOrEdit = tools.includes('Write') || tools.includes('Edit');
      const hasBaseline = text.includes('## Prompt Defense Baseline');

      if (isBuilder) {
        expect(
          hasBaseline,
          `${file}: BUILDERS (§14.5) must not carry "## Prompt Defense Baseline"`,
        ).toBe(false);
        return;
      }

      if (!hasWriteOrEdit) {
        expect(
          hasBaseline,
          `${file}: agents without Write/Edit tools must carry "## Prompt Defense Baseline"`,
        ).toBe(true);
      }
    });

    it(`${file}: "## Anti-drift" (when present) mentions .env and --no-verify`, () => {
      const body = bodyUnderHeading(text, 'Anti-drift');
      if (body === null) return;
      expect(body, `${file}: "## Anti-drift" must mention ".env"`).toContain('.env');
      expect(body, `${file}: "## Anti-drift" must mention "--no-verify"`).toContain('--no-verify');
    });
  }
});
