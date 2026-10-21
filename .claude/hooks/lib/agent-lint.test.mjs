import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  toolsListOf,
  headingsOf,
  firstLineUnderHeading,
  bodyUnderHeading,
  startsWithNothing,
  hasPromptDefenseBaseline,
  readOnlyViolations,
  READ_ONLY_AGENTS,
  WRITE_TOOLS,
} from './agent-lint.mjs';

describe('toolsListOf', () => {
  it('splits a comma-separated scalar', () => {
    expect(toolsListOf({ tools: 'Read, Grep, Glob' })).toEqual(['Read', 'Grep', 'Glob']);
  });

  it('splits a whitespace-separated scalar (no commas)', () => {
    expect(toolsListOf({ tools: 'Read Write' })).toEqual(['Read', 'Write']);
  });

  it('accepts a YAML list', () => {
    expect(toolsListOf({ tools: ['Read', 'Write'] })).toEqual(['Read', 'Write']);
  });
});

describe('headingsOf (fenced code blocks must not count as real headings)', () => {
  it('ignores a heading that only appears inside a fenced code block', () => {
    const text = [
      '## Mission',
      'Real section.',
      '',
      '```markdown',
      '## Procedure',
      'This heading is example text inside a fence, not a real section.',
      '```',
      '',
      '## Inputs',
      'Real section.',
    ].join('\n');

    // Only the two real, unfenced headings should be detected — the
    // fenced "## Procedure" must be invisible to the heading scanner.
    expect(headingsOf(text)).toEqual(['Mission', 'Inputs']);
  });

  it('ignores headings inside a ~~~ fence too', () => {
    const text = ['## Mission', '~~~', '## Inputs', '~~~', '## Allowed paths'].join('\n');
    expect(headingsOf(text)).toEqual(['Mission', 'Allowed paths']);
  });

  it('reproduces: a mismatched ~~~ line inside a ```markdown fence must not close it early', () => {
    // A ``` fence containing a stray ~~~ line, followed by real-looking
    // §6 headings and the required Anti-drift wording, all before the
    // actual closing ```. If the fence matcher toggled on ANY of ```/~~~
    // without checking the character matches the opener, the stray ~~~
    // would be read as closing the fence, re-exposing everything after
    // it to headingsOf/bodyUnderHeading as if it were real content.
    const text = [
      '## Mission',
      'Real section.',
      '',
      '```markdown',
      '~~~',
      '## Output contract',
      'fake',
      '## Stop rules',
      'fake',
      '## Anti-drift',
      'Never edit .env. Never pass --no-verify.',
      '```',
    ].join('\n');

    expect(headingsOf(text)).toEqual(['Mission']);
    expect(bodyUnderHeading(text, 'Anti-drift')).toBeNull();
  });
});

describe('bodyUnderHeading / firstLineUnderHeading (fenced + bounded)', () => {
  it('reproduces: a §6 heading that exists only inside a fence must not satisfy the real section', () => {
    // A non-legacy agent could try to fake "## Anti-drift mentions .env
    // and --no-verify" by burying the whole heading, plus the required
    // words, inside a fenced example block instead of writing a real
    // section. The real `## Anti-drift` heading must not be found at all
    // here, so bodyUnderHeading must return null, not the fenced text.
    const text = [
      '## Mission',
      'Real section.',
      '',
      '```markdown',
      '## Procedure',
      'fake',
      '## Output contract',
      'fake',
      '## Stop rules',
      'fake',
      '## Anti-drift',
      'Never edit .env. Never pass --no-verify.',
      '```',
    ].join('\n');

    expect(bodyUnderHeading(text, 'Anti-drift')).toBeNull();
  });

  it('bounds the body to the section: stops at the next real heading, not a heading-looking line inside a later fence', () => {
    const text = [
      '## Anti-drift',
      'Never edit .env.',
      'Never pass --no-verify.',
      '',
      '## Stop rules',
      'Unrelated section.',
      '',
      '```markdown',
      '## Anti-drift',
      'A decoy heading inside a fence, well after the real section already ended.',
      '```',
    ].join('\n');

    const body = bodyUnderHeading(text, 'Anti-drift');
    expect(body).toContain('.env');
    expect(body).toContain('--no-verify');
    expect(body).not.toContain('Unrelated section');
    expect(body).not.toContain('decoy');
  });

  it('reproduces: a decorative fence before the real first line must not be read as the first line', () => {
    // An agent could put a throwaway ```text fence right under the
    // heading so the fence marker (or fenced content) is seen as "the
    // first line", hiding a real violation below it.
    const text = [
      '## Allowed paths',
      '```text',
      'example of an allowed-paths line, not the real content',
      '```',
      'Nothing — the real first line.',
    ].join('\n');

    expect(firstLineUnderHeading(text, 'Allowed paths')).toBe('Nothing — the real first line.');
  });

  it('firstLineUnderHeading is bounded to its own section', () => {
    const text = [
      '## Allowed paths',
      '',
      '## Procedure',
      'This belongs to the next section and must never be read as the',
      '"first line" of Allowed paths.',
    ].join('\n');

    expect(firstLineUnderHeading(text, 'Allowed paths')).toBeNull();
  });
});

/** A minimal agent file: frontmatter tools plus an "Allowed paths" first line and extra body. */
function agentFixture({ tools, allowedPaths = 'src/** only', extra = [] }) {
  return [
    '---',
    'name: fixture',
    `tools: ${tools}`,
    '---',
    '',
    '## Allowed paths',
    '',
    allowedPaths,
    '',
    ...extra,
  ].join('\n');
}

describe('startsWithNothing (Allowed paths first line)', () => {
  it.each([
    'Nothing',
    'Nothing.',
    '- Nothing',
    '* Nothing',
    '+ Nothing',
    '> Nothing',
    '**Nothing**',
    '_Nothing_',
    '- **Nothing**',
    '> - _Nothing_',
  ])('treats %j as read-only', (line) => {
    expect(startsWithNothing(line)).toBe(true);
  });

  it.each(['src/** only', '- `docs/**`', '- The task files', 'Anything but Nothing'])(
    'does not treat %j as read-only',
    (line) => {
      expect(startsWithNothing(line)).toBe(false);
    },
  );
});

describe('readOnlyViolations', () => {
  it.each(['- Nothing', '**Nothing**'])(
    'reproduces: an Allowed paths line %j with a Write tool is a violation',
    (allowedPaths) => {
      const text = agentFixture({ tools: 'Read, Write, Grep', allowedPaths });
      const violations = readOnlyViolations('fixture', text, parseFrontmatter(text));
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('"Write"');
    },
  );

  it('reproduces: a READ_ONLY_AGENTS name that declares Write is a violation, whatever its Allowed paths says', () => {
    const text = agentFixture({ tools: 'Read, Grep, Write, NotebookEdit' });
    const violations = readOnlyViolations('gate-checker', text, parseFrontmatter(text));
    expect(violations.map((v) => v.match(/"(\w+)"$/)[1])).toEqual(['Write', 'NotebookEdit']);
  });

  it('accepts a read-only agent with only read tools, and a writer whose paths are not Nothing', () => {
    const reader = agentFixture({ tools: 'Read, Grep, Glob', allowedPaths: '- Nothing' });
    expect(readOnlyViolations('pr-reviewer', reader, parseFrontmatter(reader))).toEqual([]);
    const writer = agentFixture({ tools: 'Read, Write, Edit' });
    expect(readOnlyViolations('implementer', writer, parseFrontmatter(writer))).toEqual([]);
  });

  it('lists exactly the roster agents that must never write', () => {
    expect(READ_ONLY_AGENTS).toEqual([
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
    ]);
    expect(WRITE_TOOLS).toEqual(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
  });
});

describe('hasPromptDefenseBaseline', () => {
  it('finds a real baseline heading', () => {
    expect(hasPromptDefenseBaseline('## Mission\nx\n\n## Prompt Defense Baseline\n- rule')).toBe(
      true,
    );
  });

  it('reproduces: a baseline heading that only exists inside a fence does not count', () => {
    const text = [
      '## Mission',
      'x',
      '',
      '```markdown',
      '## Prompt Defense Baseline',
      '- rule',
      '```',
    ].join('\n');
    expect(hasPromptDefenseBaseline(text)).toBe(false);
  });

  it('does not count the phrase in prose or a deeper heading', () => {
    expect(hasPromptDefenseBaseline('See the ## Prompt Defense Baseline section.')).toBe(false);
    expect(hasPromptDefenseBaseline('### Prompt Defense Baseline\n- rule')).toBe(false);
  });
});
