import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FIX_ROUND_FACTS,
  MAX_FILES,
  PLAN_PATH,
  areaLabelFor,
  assertNodeId,
  assertPositiveInt,
  assertSha,
  assertTicketId,
  boardFieldsFor,
  buildBody,
  buildTickets,
  describePlan,
  findExistingIssue,
  issueNumberFromUrl,
  issueTitle,
  labelsFor,
  ledgerFor,
  main,
  matchCommits,
  nameTokens,
  parseTicketHeadings,
  parseWaveNames,
  previewBody,
  statusFor,
  summarizeFiles,
  waveOf,
} from '../../../scripts/pm/backfill-plan-1c.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const planText = fs.readFileSync(path.join(repoRoot, PLAN_PATH), 'utf8');

const EXPECTED_IDS = [
  'W0-1',
  'W0-2',
  'W0-3',
  'W0-4',
  'W0-5',
  'W0-6',
  'W0-7',
  'W1-1',
  'W1-2',
  'W1-3',
  'W1-4',
  'W2-1',
  'W2-2',
  'W3-1',
  'W3-2',
  'W3-3',
  'W3-4',
  'W4-1',
  'W4-2',
  'W4-3',
  'W4-4',
  'W4-5',
  'W5-1',
  'W5-2',
];

function realTickets() {
  const out = execFileSync(
    process.execPath,
    [path.join(repoRoot, '.claude/hooks/bin/plan-tasks.mjs'), PLAN_PATH],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return buildTickets(planText, JSON.parse(out));
}

const fakeSha = (n) => `${'a'.repeat(39 - String(n).length)}${n}`.slice(-40).padStart(40, 'a');

/** Builds `git log` text (newest first) from subjects listed oldest first. */
function fakeLog(subjectsOldestFirst) {
  return subjectsOldestFirst
    .map((subject, index) => `${fakeSha(index + 1)}\t${subject}`)
    .reverse()
    .join('\n');
}

const ticket = (overrides) => ({
  id: 'W1-1',
  title: 'Build and gate agents',
  wave: 1,
  files: ['.claude/agents/implementer.md', '.claude/agents/gate-checker.md'],
  createFiles: ['.claude/agents/implementer.md', '.claude/agents/gate-checker.md'],
  commitSubject: 'feat(ai): add implementer, gate-checker',
  ...overrides,
});

describe('ticket parser on the real plan', () => {
  const tickets = realTickets();

  it('finds exactly the 24 Plan 1c tickets in plan order, with no duplicates', () => {
    const ids = tickets.map((t) => t.id);
    expect(ids).toEqual(EXPECTED_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrees with the strict heading regex and the repo parser on titles', () => {
    expect(parseTicketHeadings(planText).map((h) => h.id)).toEqual(EXPECTED_IDS);
    for (const t of tickets) expect(t.title.length).toBeGreaterThan(0);
  });

  it('derives the wave from the id and names it from the plan', () => {
    expect(tickets.map((t) => t.wave)).toEqual(EXPECTED_IDS.map((id) => Number(id[1])));
    const names = parseWaveNames(planText);
    expect(names[0]).toBe('Bootstrap (serial, on main)');
    expect(names[5]).toMatch(/Owner-gated/);
  });

  it('reads the commit subject from each Commit step', () => {
    const byId = new Map(tickets.map((t) => [t.id, t]));
    expect(byId.get('W0-1').commitSubject).toBe(
      'chore: add engine coverage gate, fast-check and tooling deps',
    );
    expect(byId.get('W4-5').commitSubject).toBe('docs: explain the agentic system for judges');
    expect(byId.get('W5-2').commitSubject).toBe('chore(pm): bootstrap the Credit Coach board');
  });

  it('gives every ticket a Files list', () => {
    for (const t of tickets) expect(t.files.length, t.id).toBeGreaterThan(0);
  });
});

describe('title, labels, status and fields', () => {
  const tickets = realTickets();
  const byId = new Map(tickets.map((t) => [t.id, t]));

  it('titles are "<id>: <heading>"', () => {
    expect(issueTitle(byId.get('W3-2'))).toBe('W3-2: API, UI and integration testers');
  });

  it('judges the area label from the Files list', () => {
    const expected = {
      'W0-1': 'area:ci',
      'W0-2': 'area:ci',
      'W0-3': 'area:docs',
      'W0-4': 'area:ci',
      'W0-5': 'area:ci',
      'W0-6': 'area:ci',
      'W0-7': 'area:ci',
      'W1-1': 'area:agents',
      'W1-2': 'area:agents',
      'W1-3': 'area:agents',
      'W1-4': 'area:ci',
      'W2-1': 'area:agents',
      'W2-2': 'area:docs',
      'W3-1': 'area:agents',
      'W3-2': 'area:agents',
      'W3-3': 'area:agents',
      'W3-4': 'area:agents',
      'W4-1': 'area:agents',
      'W4-2': 'area:agents',
      'W4-3': 'area:agents',
      'W4-4': 'area:agents',
      'W4-5': 'area:docs',
      'W5-1': 'area:ci',
      'W5-2': 'area:ci',
    };
    for (const [id, label] of Object.entries(expected)) {
      expect(areaLabelFor(byId.get(id)), id).toBe(label);
    }
  });

  it('every ticket carries one area label plus agent:implementer', () => {
    for (const t of tickets) {
      const labels = labelsFor(t);
      expect(labels).toHaveLength(2);
      expect(labels[0]).toMatch(/^area:(agents|ci|docs)$/);
      expect(labels[1]).toBe('agent:implementer');
    }
  });

  it('W5-2 stays In progress, every other ticket is Done', () => {
    for (const t of tickets) {
      expect(statusFor(t), t.id).toBe(t.id === 'W5-2' ? 'In progress' : 'Done');
    }
  });

  it('sets Plan, Task #, Wave and Agent only (Attempts and Est. vs actual stay blank)', () => {
    expect(boardFieldsFor(byId.get('W3-2'))).toEqual({
      Plan: 'Plan 1c',
      'Task #': 'W3-2',
      Wave: 3,
      Agent: 'implementer',
    });
  });

  it('plans W5-2 as OPEN and the rest as closed (completed)', () => {
    expect(describePlan(byId.get('W5-2'), [], {}).state).toBe('OPEN');
    expect(describePlan(byId.get('W0-1'), [], {}).state).toBe('CLOSED (completed)');
  });
});

describe('issue body', () => {
  const tickets = realTickets();
  const waveNames = parseWaveNames(planText);
  const sample = ticket({});
  const commit = {
    sha: fakeSha(7),
    subject: 'feat(ai): add implementer, gate-checker',
    how: 'exact subject match',
  };

  it('links the delivering commit as a full GitHub URL, the ledger and the plan', () => {
    const body = buildBody(sample, [commit], waveNames);
    expect(body).toContain(`https://github.com/ShubhamU55/credit-coach/commit/${fakeSha(7)}`);
    expect(body).toContain('docs/agent-runs/2026-10-23-plan-1c-wave-1.md');
    expect(body).toContain(`github.com/ShubhamU55/credit-coach/blob/main/${PLAN_PATH}`);
    expect(body).toContain('Plan 1c ticket W1-1, Wave 1: Core agents');
  });

  it('says "No single commit found" and links the ledger when nothing matched', () => {
    const body = buildBody(sample, [], waveNames);
    expect(body).toContain('No single commit found');
    expect(body).toContain('docs/agent-runs/2026-10-23-plan-1c-wave-1.md');
    expect(body).not.toMatch(/\/commit\//);
  });

  it('states fix rounds only where a ledger does', () => {
    expect(buildBody(ticket({ id: 'W1-4' }), [], waveNames)).toContain('6 fix rounds');
    expect(buildBody(ticket({ id: 'W1-1' }), [], waveNames)).toContain('1 fix round.');
    expect(buildBody(ticket({ id: 'W2-2', wave: 2 }), [], waveNames)).not.toContain('Fix rounds');
  });

  it('carries no AI attribution line', () => {
    for (const t of tickets) {
      const body = buildBody(t, [], waveNames);
      expect(body).not.toMatch(/co-authored-by|generated with|anthropic|noreply@/i);
    }
  });

  it('caps the Files list at the maximum and says how many more', () => {
    const files = Array.from({ length: MAX_FILES + 3 }, (_, i) => `docs/f${i}.md`);
    const lines = summarizeFiles(files);
    expect(lines).toHaveLength(MAX_FILES + 1);
    expect(lines.at(-1)).toBe('- ... and 3 more in the plan');
    expect(summarizeFiles(['a/b.md'])).toEqual(['- `a/b.md`']);
  });

  it('previews the first 12 lines of a body', () => {
    const body = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    expect(previewBody(body)).toHaveLength(12);
  });
});

describe('ledger links and fix-round facts', () => {
  it('maps every ticket but W5-2 to an existing ledger under docs/agent-runs', () => {
    for (const id of EXPECTED_IDS) {
      const ledger = ledgerFor(id);
      if (id === 'W5-2') {
        expect(ledger).toBeNull();
      } else {
        expect(fs.existsSync(path.join(repoRoot, ledger)), `${id} -> ${ledger}`).toBe(true);
      }
    }
  });

  it('every fix-round fact is stated verbatim in its committed ledger', () => {
    for (const fact of FIX_ROUND_FACTS) {
      const text = fs.readFileSync(path.join(repoRoot, 'docs/agent-runs', fact.ledger), 'utf8');
      expect(text.includes(fact.evidence), `${fact.id}: ${fact.evidence}`).toBe(true);
      expect(EXPECTED_IDS).toContain(fact.id);
    }
  });
});

describe('commit matching from a fake log', () => {
  const a = ticket({ id: 'W1-1', commitSubject: 'feat(ai): add implementer, gate-checker' });
  const b = ticket({
    id: 'W2-1',
    wave: 2,
    files: ['.claude/workflows/feature-build.workflow.js', '.claude/commands/build.md'],
    createFiles: ['.claude/workflows/feature-build.workflow.js'],
    commitSubject: 'feat(ai): add feature-build workflow',
  });
  const c = ticket({
    id: 'W5-1',
    wave: 5,
    files: ['sonar-project.properties'],
    createFiles: [],
    commitSubject: 'chore(ci): record branch protection',
  });

  it('matches the plan subject exactly and returns the log SHA', () => {
    const log = fakeLog(['docs: other', 'feat(ai): add implementer, gate-checker']);
    const result = matchCommits([a], log).get('W1-1');
    expect(result).toEqual([
      {
        sha: fakeSha(2),
        subject: 'feat(ai): add implementer, gate-checker',
        how: 'exact subject match',
      },
    ]);
  });

  it('accepts a squash-merge " (#N)" suffix but not a different subject', () => {
    const log = fakeLog([
      'feat(ai): add implementer, gate-checker (#12)',
      'feat(ai): add implementer, gate-checker too',
    ]);
    expect(
      matchCommits([a], log)
        .get('W1-1')
        .map((x) => x.sha),
    ).toEqual([fakeSha(1)]);
  });

  it('returns every commit that carries the subject (duplicate subjects)', () => {
    const log = fakeLog([
      'feat(ai): add implementer, gate-checker',
      'feat(ai): add implementer, gate-checker',
    ]);
    expect(matchCommits([a], log).get('W1-1')).toHaveLength(2);
  });

  it('returns nothing, not a guess, when no subject matches', () => {
    const log = fakeLog(['docs: record branch protection, CI fixes (#4)']);
    expect(matchCommits([c], log).get('W5-1')).toEqual([]);
  });

  it('adds a later fix commit that plainly names the ticket agent', () => {
    const log = fakeLog([
      'feat(ai): add implementer, gate-checker',
      'fix(ai): guard implementer reset',
      'feat(ai): add feature-build workflow',
    ]);
    const result = matchCommits([a, b], log).get('W1-1');
    expect(result.map((x) => x.sha)).toEqual([fakeSha(1), fakeSha(2)]);
    expect(result[1].how).toContain('implementer');
  });

  it('ignores a fix commit after the next wave started, or one naming a part of a word', () => {
    const log = fakeLog([
      'feat(ai): add implementer, gate-checker',
      'feat(ai): add feature-build workflow',
      'fix(ai): tweak implementer prompt',
    ]);
    expect(matchCommits([a, b], log).get('W1-1')).toHaveLength(1);

    const log2 = fakeLog([
      'feat(ai): add implementer, gate-checker',
      'fix(ai): tweak implementers prompt',
    ]);
    expect(matchCommits([a], log2).get('W1-1')).toHaveLength(1);
  });

  it('ignores a non-fix commit that names the agent', () => {
    const log = fakeLog(['feat(ai): add implementer, gate-checker', 'docs: mention implementer']);
    expect(matchCommits([a], log).get('W1-1')).toHaveLength(1);
  });

  it('gives a fix commit to no ticket when two tickets in the window claim it', () => {
    const twin = ticket({ id: 'W1-2', commitSubject: 'feat(ai): add twin agents' });
    const log = fakeLog([
      'feat(ai): add implementer, gate-checker',
      'feat(ai): add twin agents',
      'fix(ai): harden implementer',
    ]);
    const result = matchCommits([a, twin], log);
    expect(result.get('W1-1')).toHaveLength(1);
    expect(result.get('W1-2')).toHaveLength(1);
  });

  it('only names tracked agent, workflow and command files, at least 6 characters long', () => {
    expect(nameTokens(a).sort()).toEqual(['gate-checker', 'implementer']);
    expect(nameTokens(b)).toEqual(['feature-build']);
    expect(nameTokens(c)).toEqual([]);
  });

  it('rejects a log line with a malformed SHA', () => {
    expect(() => matchCommits([a], 'not-a-sha\tfeat: x')).toThrow(/invalid commit sha/);
  });
});

describe('strict validation', () => {
  it('accepts only W<0-5>-<1-9> ticket ids', () => {
    expect(assertTicketId('W3-2')).toBe('W3-2');
    expect(waveOf('W4-5')).toBe(4);
    for (const bad of ['W6-1', 'W0-0', 'W0-10', 'w1-1', 'W1-1; rm', '', undefined, 'W1-1\n']) {
      expect(() => assertTicketId(bad), String(bad)).toThrow(/invalid ticket id/);
    }
  });

  it('accepts only 40-character lowercase hex SHAs', () => {
    expect(assertSha('a'.repeat(40))).toBe('a'.repeat(40));
    for (const bad of [
      'a'.repeat(39),
      'A'.repeat(40),
      `${'a'.repeat(39)}g`,
      `${'a'.repeat(40)} x`,
    ]) {
      expect(() => assertSha(bad)).toThrow(/invalid commit sha/);
    }
  });

  it('accepts only plain node ids and positive integers', () => {
    expect(assertNodeId('PVTF_lAHOD8roLc4BpAvhzhnePDw', 'field')).toBe(
      'PVTF_lAHOD8roLc4BpAvhzhnePDw',
    );
    expect(assertNodeId('fe707316', 'option')).toBe('fe707316');
    for (const bad of ['', 'a b', 'a;b', '$(x)', 'a\nb', undefined, 5]) {
      expect(() => assertNodeId(bad, 'x')).toThrow(/invalid x id/);
    }
    expect(assertPositiveInt(12, 'n')).toBe('12');
    for (const bad of ['0', '-1', '1.5', '1 2', 'abc', '']) {
      expect(() => assertPositiveInt(bad, 'n')).toThrow(/invalid n/);
    }
  });

  it('reads the issue number only from a ShubhamU55/credit-coach issue URL', () => {
    expect(issueNumberFromUrl('https://github.com/ShubhamU55/credit-coach/issues/17\n')).toBe('17');
    for (const bad of [
      'https://github.com/other/repo/issues/1',
      'https://github.com/ShubhamU55/credit-coach/issues/0',
      'https://github.com/ShubhamU55/credit-coach/pull/3',
      'https://evil.example/ShubhamU55/credit-coach/issues/3',
      '',
    ]) {
      expect(() => issueNumberFromUrl(bad)).toThrow(/unexpected issue url/);
    }
  });
});

describe('idempotency', () => {
  const issues = [
    { number: 3, title: 'W1-1: Build and gate agents', state: 'CLOSED' },
    { number: 4, title: 'W1-2: Verifier agents', state: 'CLOSED' },
    { number: 5, title: 'Fix W1-3: not ours', state: 'OPEN' },
  ];

  it('finds an existing issue by exact "<id>: " title prefix', () => {
    expect(findExistingIssue(issues, 'W1-1').number).toBe(3);
    expect(findExistingIssue(issues, 'W1-2').number).toBe(4);
  });

  it('does not treat a title that merely mentions the id as existing', () => {
    expect(findExistingIssue(issues, 'W1-3')).toBeNull();
    expect(findExistingIssue(issues, 'W2-1')).toBeNull();
  });
});

describe('command line', () => {
  it('rejects unknown arguments before any gh call', () => {
    expect(() => main(['--force'])).toThrow(/unknown argument/);
  });
});
