import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../lib/agent-lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesDir = path.resolve(here, '../../rules');

const ATTRIBUTION = '<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->';

// Rules whose subject is source code and infrastructure, so they only need to be in context
// while such files are being read. Everything else applies to any session and stays unscoped.
const CODE_SCOPED = ['coding-style.md', 'code-review.md', 'security.md'];
const ALWAYS_LOADED_BUDGET_LINES = 250;

const rules = fs
  .readdirSync(rulesDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => {
    const text = fs.readFileSync(path.join(rulesDir, file), 'utf8');
    return { file, text, paths: parseFrontmatter(text)?.paths ?? null };
  });
const rule = (file) => rules.find((candidate) => candidate.file === file);

describe('.claude/rules scoping', () => {
  it.each(CODE_SCOPED)('%s loads only while code or infrastructure files are in play', (file) => {
    const { paths } = rule(file);

    expect(paths).toEqual(expect.arrayContaining(['supabase/**', '.github/**']));
    expect(paths.some((glob) => glob.includes('*.ts'))).toBe(true);
  });

  it('keeps testing, git, agent and workflow rules unscoped, since they apply to any session', () => {
    const unscoped = rules.filter(({ paths }) => paths === null).map(({ file }) => file);

    expect(unscoped).toEqual(
      expect.arrayContaining([
        'testing.md',
        'git-workflow.md',
        'agents.md',
        'development-workflow.md',
      ]),
    );
  });

  it(`keeps the always-loaded rules under ${ALWAYS_LOADED_BUDGET_LINES} lines`, () => {
    const lines = rules
      .filter(({ paths }) => paths === null)
      .reduce((total, { text }) => total + text.split('\n').length, 0);

    expect(lines).toBeLessThanOrEqual(ALWAYS_LOADED_BUDGET_LINES);
  });

  it('keeps the ECC attribution on every adapted rule', () => {
    const missing = rules.filter(({ text }) => !text.includes(ATTRIBUTION)).map(({ file }) => file);

    expect(missing).toEqual([]);
  });
});

describe('.claude/rules content that does not fit this project', () => {
  it('react-native.md names no iOS, store, OTA, crash-reporting or Detox guidance (PRD: Android-only sideloaded APK)', () => {
    const offending = rule('react-native.md').text.match(
      /Detox|EAS (Update|Submit)|expo-updates|Sentry|App Store|Play Store|TestFlight|ios\.buildNumber|physical iOS/gi,
    );

    expect(offending).toBeNull();
  });

  it('react-native.md points E2E at Maestro, which is what the project runs', () => {
    expect(rule('react-native.md').text).toMatch(/Maestro/);
  });

  it('typescript.md carries no speculative-abstraction templates (coding-style.md: YAGNI)', () => {
    expect(rule('typescript.md').text).not.toMatch(
      /Repository Pattern|interface Repository<|interface ApiResponse</,
    );
  });

  it('typescript.md does not point at a hook that does not exist', () => {
    expect(rule('typescript.md').text).not.toMatch(/See hooks for automatic detection/);
  });
});

describe('.claude/rules workflow and agent rules are current', () => {
  it.each(['agents.md', 'development-workflow.md'])(
    '%s makes no "planned, not yet built" claims (the workflows and agents all exist)',
    (file) => {
      expect(rule(file).text).not.toMatch(/not (yet )?built|planned roster|planned pipeline/i);
    },
  );

  it('agents.md keeps the Delegation Completion Contract', () => {
    expect(rule('agents.md').text).toMatch(/^## Delegation Completion Contract$/m);
  });
});
