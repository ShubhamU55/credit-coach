import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesOutsideFences } from '../lib/markdown-fences.mjs';

// Ruling 1 (config-audit scope):
// - the hidden-character check applies to EVERY file under `.claude/**`
//   (excluding node_modules) plus `CLAUDE.md`.
// - the text-pattern checks (ANTHROPIC_BASE_URL, curl|wget piped to a
//   shell, bare `<!--`) apply only to prompt surfaces: `.md` and `.json`
//   files. Tooling code (this test, vendored ECC hooks) legitimately
//   contains those strings, so it is out of scope for the text checks.
const HIDDEN_CHAR_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;
const CURL_PIPE_SHELL_PATTERN = /(curl|wget)[^\n|]*\|\s*(sh|bash)/;
const ATTRIBUTION_LINE = '<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->';

// { path, startsWith, reason }: a bare `<!--` outside a fenced code block is
// allowed only when it is the attribution line, or listed here.
const COMMENT_ALLOWLIST = [
  {
    path: '.claude/skills/app-security-review/SKILL.md',
    startsWith: '<!-- Do not write a literal dollar-sign-N',
    reason:
      'seeded allow-list entry: explains why this file must never contain a literal $N placeholder',
  },
];

// { path, lineIncludes, reason }: curl|wget piped to a shell outside a
// fenced code block is allowed only when listed here.
const CURL_PIPE_ALLOWLIST = [
  {
    path: '.claude/skills/tdd-workflow/SKILL.md',
    lineIncludes: 'but `curl ... | sh` must be rejected',
    reason: 'prose warning against the curl-pipe-shell anti-pattern, not an executable instruction',
  },
  {
    path: '.claude/settings.json',
    lineIncludes: '"Bash(curl * | sh*)"',
    reason: 'permission deny-list entry blocking curl piped to sh, not an executable instruction',
  },
  {
    path: '.claude/settings.json',
    lineIncludes: '"Bash(curl * | bash*)"',
    reason: 'permission deny-list entry blocking curl piped to bash, not an executable instruction',
  },
  {
    path: '.claude/settings.json',
    lineIncludes: '"Bash(wget * | sh*)"',
    reason: 'permission deny-list entry blocking wget piped to sh, not an executable instruction',
  },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const claudeDir = path.join(repoRoot, '.claude');

function listFilesRecursive(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
      continue;
    }
    if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

function relPath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

const allConfigFiles = [...listFilesRecursive(claudeDir), path.join(repoRoot, 'CLAUDE.md')].sort();
const promptSurfaceFiles = allConfigFiles.filter((f) => f.endsWith('.md') || f.endsWith('.json'));

describe('config audit: hidden characters (every file under .claude/** plus CLAUDE.md)', () => {
  for (const filePath of allConfigFiles) {
    const rel = relPath(filePath);
    it(`${rel}: has no bidi-override, zero-width, or BOM characters`, () => {
      const text = fs.readFileSync(filePath, 'utf8');
      const match = text.match(HIDDEN_CHAR_PATTERN);
      if (!match) return;
      const codePoint = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      expect.fail(
        `${rel}: contains hidden character U+${codePoint} (rule: config-audit hidden-character ban)`,
      );
    });
  }
});

describe('config audit: prompt-surface text patterns (.md and .json under .claude/** plus CLAUDE.md)', () => {
  for (const filePath of promptSurfaceFiles) {
    const rel = relPath(filePath);
    const text = fs.readFileSync(filePath, 'utf8');

    it(`${rel}: does not reference ANTHROPIC_BASE_URL`, () => {
      expect(
        text,
        `${rel}: contains "ANTHROPIC_BASE_URL" (rule: config-audit ANTHROPIC_BASE_URL ban)`,
      ).not.toContain('ANTHROPIC_BASE_URL');
    });

    it(`${rel}: has no curl|wget piped to a shell outside fenced code blocks (unless allow-listed)`, () => {
      const offenders = linesOutsideFences(text).filter(({ text: lineText }) =>
        CURL_PIPE_SHELL_PATTERN.test(lineText),
      );
      for (const offender of offenders) {
        const allowed = CURL_PIPE_ALLOWLIST.some(
          (entry) => entry.path === rel && offender.text.includes(entry.lineIncludes),
        );
        expect(
          allowed,
          `${rel}:${offender.lineNumber}: curl|wget piped to a shell outside a fenced code block, not allow-listed (rule: config-audit curl-pipe-shell ban): ${offender.text.trim()}`,
        ).toBe(true);
      }
    });

    it(`${rel}: has no bare <!-- outside fenced code blocks (unless the attribution line or allow-listed)`, () => {
      const offenders = linesOutsideFences(text).filter(({ text: lineText }) =>
        lineText.includes('<!--'),
      );
      for (const offender of offenders) {
        const trimmed = offender.text.trim();
        if (trimmed === ATTRIBUTION_LINE) continue;
        const allowed = COMMENT_ALLOWLIST.some(
          (entry) => entry.path === rel && trimmed.startsWith(entry.startsWith),
        );
        expect(
          allowed,
          `${rel}:${offender.lineNumber}: HTML comment outside a fenced code block, not allow-listed (rule: config-audit HTML-comment ban): ${trimmed}`,
        ).toBe(true);
      }
    });
  }
});
