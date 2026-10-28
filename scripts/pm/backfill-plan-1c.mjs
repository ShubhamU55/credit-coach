#!/usr/bin/env node
// backfill-plan-1c.mjs - one-off, idempotent backfill of the Plan 1c tickets onto the
// "Credit Coach" GitHub Projects board (Plan 1c, Task W5-2 step 3).
//
// Files one GitHub issue per Plan 1c ticket (W0-1 .. W5-2), adds each to the board, sets its
// board fields and Status, and closes the delivered ones. W5-2 itself stays OPEN with Status
// "In progress". Tickets are parsed from the plan with the repo's own parser
// (.claude/hooks/bin/plan-tasks.mjs); the delivering commit(s) are matched against
// `git log origin/main` by the plan's own commit subject. A SHA is only ever copied from git log.
//
// Usage:
//   GH_TOKEN=$(gh auth token --user ShubhamU55) node scripts/pm/backfill-plan-1c.mjs [--apply]
//
//   (default)  dry run: only read-only gh calls; prints each planned issue and the first lines
//              of its body.
//   --apply    creates / closes issues and writes board fields.
//
// Required token scopes: `repo` (issues, labels, milestones) and `project` (Projects v2).
//
// Safety:
//   - Refuses to run unless GH_TOKEN is set and `gh api user --jq .login` is ShubhamU55.
//   - Idempotent: an existing issue whose title starts with "<id>: " is never re-created;
//     `gh project item-add` returns the existing board item, and item-edit re-sets the same
//     values. A second run creates nothing.
//   - Every id read back from GitHub is validated against a strict pattern before it is used
//     as a command argument. All commands run through execFileSync with argument arrays,
//     never a shell string.
//   - One-off: delete this script once the board is backfilled.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OWNER = 'ShubhamU55';
export const REPO = 'ShubhamU55/credit-coach';
export const PROJECT_NUMBER = '1';
export const MILESTONE = 'Agentic system';
export const PLAN_PATH = 'docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md';
export const PLAN_LABEL = 'Plan 1c';
export const AGENT_NAME = 'implementer';
export const MAX_FILES = 12;
export const BODY_PREVIEW_LINES = 12;
export const OPEN_TICKET_ID = 'W5-2';
export const STATUS_DONE = 'Done';
export const STATUS_IN_PROGRESS = 'In progress';
export const BOARD_FIELDS = ['Plan', 'Task #', 'Wave', 'Agent', 'Attempts', 'Est. vs actual'];

const BLOB_BASE = `https://github.com/${REPO}/blob/main`;
const COMMIT_BASE = `https://github.com/${REPO}/commit`;
const MIN_TOKEN_LENGTH = 6;
const PAUSE_MS = 1000;

const TICKET_ID = /^W[0-5]-[1-9]$/;
const SHA = /^[0-9a-f]{40}$/;
const NODE_ID = /^[A-Za-z0-9_-]+$/;
const POSITIVE_INT = /^[1-9][0-9]*$/;
const ISSUE_URL = /^https:\/\/github\.com\/ShubhamU55\/credit-coach\/issues\/([1-9][0-9]*)$/;
const TASK_HEADING = /^### Task (W[0-5]-[1-9]): (.+)$/;
const WAVE_HEADING = /^## Wave ([0-5]): (.+)$/;
const COMMIT_STEP = /Commit\*\*\s+`([^`]+)`/;
const FIX_COMMIT = /^fix(?:\([^)]*\))?!?: /;
const SQUASH_SUFFIX = / \(#[1-9][0-9]*\)$/;
const TRACKED_DIRS = ['.claude/agents/', '.claude/workflows/', '.claude/commands/'];

// Run ledgers committed under docs/agent-runs/, by wave, with per-ticket overrides.
const LEDGER_BY_WAVE = {
  0: '2026-10-22-plan-1c-wave-0-1.md',
  1: '2026-10-23-plan-1c-wave-1.md',
  2: '2026-10-24-plan-1c-wave-2.md',
  3: '2026-10-27-plan-1c-wave-3.md',
  4: '2026-10-27-plan-1c-wave-4.md',
};
const LEDGER_BY_TICKET = {
  'W2-2': '2026-10-26-dry-run-plan-4a-task-2.md',
  'W5-1': '2026-10-23-branch-protection.md',
};

// Fix-round counts, each with the exact ledger text that states it (a test checks that the
// text is in the file). The ledgers state fix rounds, never "attempts", so the Attempts
// board field stays blank.
export const FIX_ROUND_FACTS = [
  {
    id: 'W0-5',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[0],
    evidence: 'Task W0-5: complete (commits 3a5af2c..d47a6be, review clean after 1 fix round)',
  },
  {
    id: 'W0-6',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[0],
    evidence: 'Task W0-6: complete (commits d47a6be..fc462a6, review clean after 1 fix round)',
  },
  {
    id: 'W0-7',
    rounds: 3,
    ledger: LEDGER_BY_WAVE[0],
    evidence: 'Task W0-7: complete (commits fc462a6..4dcd5ff, review clean after 3 fix rounds)',
  },
  {
    id: 'W1-1',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[1],
    evidence: 'Task W1-1: complete (review clean after 1 fix round)',
  },
  {
    id: 'W1-2',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[1],
    evidence: 'Task W1-2: complete (7caf31d..ca8f97d, review clean after 1 fix round)',
  },
  {
    id: 'W1-3',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[1],
    evidence: 'Task W1-3: complete (review clean after 1 fix round)',
  },
  {
    id: 'W1-4',
    rounds: 6,
    ledger: LEDGER_BY_WAVE[1],
    evidence: 'Task W1-4: CONVERGED. 6 fix rounds total',
  },
  { id: 'W2-1', rounds: 5, ledger: LEDGER_BY_WAVE[2], evidence: 'Task W2-1: 5 fix rounds total' },
  {
    id: 'W3-1',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[3],
    evidence: '**W3-1 (requirements-analyst, domain-checker, design-checker).** 1 fix round.',
  },
  {
    id: 'W3-2',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[3],
    evidence: '**W3-2 (api-tester, ui-tester, integration-tester).** 1 fix round.',
  },
  {
    id: 'W3-3',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[3],
    evidence: '**W3-3 (bug-analyst, bug-reporter, bug.yml).** 1 fix round.',
  },
  {
    id: 'W3-4',
    rounds: 3,
    ledger: LEDGER_BY_WAVE[3],
    evidence: '**W3-4 (pr-reviewer, pr-test-analyzer, pm-sync, journal-writer) — 3 fix rounds',
  },
  {
    id: 'W4-1',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[4],
    evidence: '## Addendum 2: W4-1 fix round 1 finished',
  },
  {
    id: 'W4-2',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[4],
    evidence: '**W4-2** `d8f7aee` (after 1 fix round',
  },
  {
    id: 'W4-3',
    rounds: 2,
    ledger: LEDGER_BY_WAVE[4],
    evidence: '**W4-3** merged ff-only after 2 fix rounds',
  },
  {
    id: 'W4-4',
    rounds: 1,
    ledger: LEDGER_BY_WAVE[4],
    evidence: '**W4-4** `2185dee` (after 1 fix round',
  },
];

// ---------------------------------------------------------------------------------------
// Pure functions (exported for tests)
// ---------------------------------------------------------------------------------------

/** Throws unless `value` is a Plan 1c ticket id such as W3-2. */
export function assertTicketId(value) {
  if (typeof value !== 'string' || !TICKET_ID.test(value)) {
    throw new Error(`invalid ticket id: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error(`invalid commit sha: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertNodeId(value, what) {
  if (typeof value !== 'string' || !NODE_ID.test(value)) {
    throw new Error(`invalid ${what} id: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertPositiveInt(value, what) {
  const text = String(value);
  if (!POSITIVE_INT.test(text)) throw new Error(`invalid ${what}: ${JSON.stringify(value)}`);
  return text;
}

/** The issue number from a `gh issue create` URL, or throws. */
export function issueNumberFromUrl(value) {
  const match = ISSUE_URL.exec(String(value).trim());
  if (!match) throw new Error(`unexpected issue url: ${JSON.stringify(value)}`);
  return match[1];
}

export function waveOf(id) {
  return Number(assertTicketId(id)[1]);
}

/** `{ number: name }` from the plan's `## Wave N: name` headings (backticks stripped). */
export function parseWaveNames(planText) {
  const names = {};
  for (const line of String(planText).replace(/\r\n/g, '\n').split('\n')) {
    const match = WAVE_HEADING.exec(line);
    if (match) names[Number(match[1])] = match[2].replaceAll('`', '').trim();
  }
  return names;
}

/** Strict `### Task W<n>-<m>: title` headings, in plan order. */
export function parseTicketHeadings(planText) {
  const out = [];
  for (const line of String(planText).replace(/\r\n/g, '\n').split('\n')) {
    const match = TASK_HEADING.exec(line);
    if (match) out.push({ id: match[1], title: match[2].trim() });
  }
  return out;
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Tickets from the plan text plus the repo parser's task objects. The strict headings decide
 * which tickets exist and in what order; the parser supplies files and the Commit step text.
 * A heading the parser did not return keeps an empty Files list.
 */
export function buildTickets(planText, parsedTasks) {
  const byId = new Map(parsedTasks.map((task) => [task.id, task]));
  return parseTicketHeadings(planText).map(({ id, title }) => {
    const task = byId.get(id);
    const commit = task ? COMMIT_STEP.exec(task.text ?? '') : null;
    return {
      id,
      title,
      wave: waveOf(id),
      files: task ? unique([...(task.files ?? []), ...(task.testFiles ?? [])]) : [],
      createFiles: task ? (task.createFiles ?? []) : [],
      commitSubject: commit ? commit[1] : null,
    };
  });
}

/** Tracked agent/workflow/command names a fix-up commit subject may plainly name. */
export function nameTokens(ticket) {
  const paths = unique([...ticket.files, ...ticket.createFiles]).filter((file) =>
    TRACKED_DIRS.some((dir) => file.startsWith(dir)),
  );
  const stems = paths.map((file) =>
    path.posix
      .basename(file)
      .replace(/\.md$/, '')
      .replace(/\.workflow\.js$/, ''),
  );
  return unique(stems).filter((stem) => stem.length >= MIN_TOKEN_LENGTH);
}

function subjectNames(subject, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`).test(subject);
}

/** `[{ sha, subject }]`, oldest first, from `git log --format=%H%x09%s` (newest first). */
export function parseGitLog(logText) {
  return String(logText)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return { sha: assertSha(line.slice(0, tab)), subject: line.slice(tab + 1) };
    })
    .reverse();
}

/**
 * Delivering commits per ticket. Primary: the plan's commit subject, exact (a squash-merge
 * " (#N)" suffix is allowed). Follow-up: a `fix(...)` commit after the ticket's primary and
 * before any later wave's first primary, whose subject plainly names one of the ticket's own
 * agent/workflow/command files, and which no other ticket claims. Nothing else is guessed.
 *
 * @returns {Map<string, {sha: string, subject: string, how: string}[]>}
 */
export function matchCommits(tickets, logText) {
  const entries = parseGitLog(logText);
  const primary = new Map();
  const primaryIndexes = new Map();

  for (const ticket of tickets) {
    const indexes = [];
    entries.forEach((entry, index) => {
      if (
        ticket.commitSubject &&
        entry.subject.replace(SQUASH_SUFFIX, '') === ticket.commitSubject
      ) {
        indexes.push(index);
      }
    });
    primaryIndexes.set(ticket.id, indexes);
    primary.set(
      ticket.id,
      indexes.map((index) => ({ ...entries[index], how: 'exact subject match' })),
    );
  }

  const claimed = new Set([...primaryIndexes.values()].flat());
  const claims = new Map();
  for (const ticket of tickets) {
    const own = primaryIndexes.get(ticket.id);
    if (own.length === 0) continue;
    const start = Math.min(...own);
    const laterStarts = tickets
      .filter((other) => other.wave > ticket.wave)
      .flatMap((other) => primaryIndexes.get(other.id));
    const end = laterStarts.length > 0 ? Math.min(...laterStarts) : entries.length;
    const tokens = nameTokens(ticket);
    for (let index = start + 1; index < end; index += 1) {
      const { subject } = entries[index];
      if (claimed.has(index) || !FIX_COMMIT.test(subject)) continue;
      const token = tokens.find((candidate) => subjectNames(subject, candidate));
      if (!token) continue;
      claims.set(index, [...(claims.get(index) ?? []), { id: ticket.id, token }]);
    }
  }

  const result = new Map();
  for (const ticket of tickets) result.set(ticket.id, [...primary.get(ticket.id)]);
  for (const [index, claimants] of claims) {
    if (claimants.length !== 1) continue;
    const [{ id, token }] = claimants;
    result.get(id).push({ ...entries[index], how: `follow-up fix naming \`${token}\`` });
  }
  return result;
}

export function ledgerFor(id) {
  assertTicketId(id);
  const file = LEDGER_BY_TICKET[id] ?? LEDGER_BY_WAVE[waveOf(id)];
  return file ? `docs/agent-runs/${file}` : null;
}

export function fixRoundFact(id) {
  return FIX_ROUND_FACTS.find((fact) => fact.id === id) ?? null;
}

export function issueTitle(ticket) {
  return `${ticket.id}: ${ticket.title}`;
}

export function isOpenTicket(ticket) {
  return ticket.id === OPEN_TICKET_ID;
}

export function statusFor(ticket) {
  return isOpenTicket(ticket) ? STATUS_IN_PROGRESS : STATUS_DONE;
}

function startsWithAny(file, prefixes) {
  return prefixes.some((prefix) => file.startsWith(prefix));
}

const CI_PREFIXES = [
  '.github/workflows/',
  '.claude/hooks/',
  '.claude/settings.json',
  'sonar-project',
  'osv-scanner',
  'eslint',
  'apps/mobile/eslint',
  'apps/admin/eslint',
  'packages/engine/package.json',
  'packages/engine/vitest',
  'pnpm-lock',
  'scripts/',
];
const DOCS_PREFIXES = ['docs/', 'README.md', 'CLAUDE.md', 'scratch/'];
const AREA_OVERRIDES = { 'W1-4': 'area:ci' };

/** `area:agents` | `area:ci` | `area:docs`, judged from the ticket's Files list. */
export function areaLabelFor(ticket) {
  const override = AREA_OVERRIDES[ticket.id];
  if (override) return override;
  if (ticket.files.some((file) => startsWithAny(file, TRACKED_DIRS))) return 'area:agents';
  if (ticket.files.some((file) => startsWithAny(file, CI_PREFIXES))) return 'area:ci';
  if (ticket.files.some((file) => startsWithAny(file, DOCS_PREFIXES))) return 'area:docs';
  return 'area:agents';
}

export function labelsFor(ticket) {
  return [areaLabelFor(ticket), `agent:${AGENT_NAME}`];
}

/** Board field values by field name; Attempts and Est. vs actual stay blank. */
export function boardFieldsFor(ticket) {
  return {
    Plan: PLAN_LABEL,
    'Task #': ticket.id,
    Wave: ticket.wave,
    Agent: AGENT_NAME,
  };
}

/** Markdown bullet list of the Files, capped at MAX_FILES. */
export function summarizeFiles(files) {
  if (files.length === 0) return ['- (the plan lists no files for this ticket)'];
  const shown = files.slice(0, MAX_FILES).map((file) => `- \`${file}\``);
  const rest = files.length - MAX_FILES;
  return rest > 0 ? [...shown, `- ... and ${rest} more in the plan`] : shown;
}

function commitLines(ticket, commits) {
  if (commits.length > 0) {
    return commits.map((c) => `- ${COMMIT_BASE}/${assertSha(c.sha)} \`${c.subject}\` (${c.how})`);
  }
  const ledger = ledgerFor(ticket.id);
  const where = ledger ? `see the run ledger below (\`${ledger}\`)` : 'none yet';
  return [`- No single commit found for this ticket; ${where}.`];
}

function linkLines(ticket) {
  const ledger = ledgerFor(ticket.id);
  const lines = [];
  if (ledger) lines.push(`- Run ledger: [${ledger}](${BLOB_BASE}/${ledger})`);
  lines.push(`- Plan: [${PLAN_PATH}](${BLOB_BASE}/${PLAN_PATH})`);
  return lines;
}

/** The issue body: plain facts, no attribution lines. */
export function buildBody(ticket, commits, waveNames) {
  const waveName = waveNames[ticket.wave] ? `: ${waveNames[ticket.wave]}` : '';
  const lines = [
    `Plan 1c ticket ${ticket.id}, Wave ${ticket.wave}${waveName}.`,
    '',
    `Goal: ${ticket.title.replaceAll('`', '')}.`,
    '',
    '**Files**',
    ...summarizeFiles(ticket.files),
    '',
    '**Delivered by (git log origin/main)**',
    ...commitLines(ticket, commits),
    '',
    '**Links**',
    ...linkLines(ticket),
  ];
  const fact = fixRoundFact(ticket.id);
  if (fact) {
    const noun = fact.rounds === 1 ? 'fix round' : 'fix rounds';
    lines.push('', '**Fix rounds (from the run ledger)**', `- ${fact.rounds} ${noun}.`);
  }
  if (isOpenTicket(ticket)) {
    lines.push('', 'Open: stays In progress until the README board link and docs/status.md land.');
  }
  return lines.join('\n');
}

export function previewBody(body, count = BODY_PREVIEW_LINES) {
  return body.split('\n').slice(0, count);
}

/** Existing issue whose title starts with "<id>: " (exact prefix, so W0-1 never hits W0-10). */
export function findExistingIssue(issues, id) {
  const prefix = `${assertTicketId(id)}: `;
  return (
    issues.find((issue) => typeof issue.title === 'string' && issue.title.startsWith(prefix)) ??
    null
  );
}

export function describePlan(ticket, commits, waveNames) {
  return {
    title: issueTitle(ticket),
    labels: labelsFor(ticket),
    milestone: MILESTONE,
    state: isOpenTicket(ticket) ? 'OPEN' : 'CLOSED (completed)',
    status: statusFor(ticket),
    fields: boardFieldsFor(ticket),
    body: buildBody(ticket, commits, waveNames),
  };
}

// ---------------------------------------------------------------------------------------
// gh / git plumbing
// ---------------------------------------------------------------------------------------

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function makeGh(apply) {
  const read = (args) => run('gh', args);
  const mutate = (args, options) => {
    if (!apply) throw new Error(`refusing a mutating gh call in dry-run: gh ${args.join(' ')}`);
    return run('gh', args, options);
  };
  return { read, mutate };
}

function requireOwner(gh) {
  if (!process.env.GH_TOKEN) {
    throw new Error('GH_TOKEN is not set. Run with GH_TOKEN=$(gh auth token --user ShubhamU55).');
  }
  const login = gh.read(['api', 'user', '--jq', '.login']).trim();
  if (login !== OWNER) throw new Error(`token authenticates as "${login}", expected ${OWNER}`);
}

/** Board ids resolved read-only: project id, field ids, Status option ids. */
function loadBoard(gh) {
  const view = JSON.parse(
    gh.read(['project', 'view', PROJECT_NUMBER, '--owner', OWNER, '--format', 'json']),
  );
  const fieldList = JSON.parse(
    gh.read(['project', 'field-list', PROJECT_NUMBER, '--owner', OWNER, '--format', 'json']),
  );
  const fields = new Map(fieldList.fields.map((field) => [field.name, field]));
  for (const name of [...BOARD_FIELDS, 'Status']) {
    if (!fields.has(name)) throw new Error(`board field "${name}" is missing`);
  }
  const options = new Map((fields.get('Status').options ?? []).map((o) => [o.name, o.id]));
  for (const name of [STATUS_DONE, STATUS_IN_PROGRESS]) {
    if (!options.has(name)) throw new Error(`Status option "${name}" is missing`);
  }
  return {
    projectId: assertNodeId(view.id, 'project'),
    fieldId: (name) => assertNodeId(fields.get(name).id, `field ${name}`),
    statusOptionId: (name) => assertNodeId(options.get(name), `Status option ${name}`),
  };
}

function lines(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function verifyLabelsAndMilestone(gh, tickets) {
  const labels = new Set(
    lines(
      gh.read([
        'label',
        'list',
        '--repo',
        REPO,
        '--limit',
        '500',
        '--json',
        'name',
        '--jq',
        '.[].name',
      ]),
    ),
  );
  const missing = unique(tickets.flatMap(labelsFor)).filter((name) => !labels.has(name));
  if (missing.length > 0) throw new Error(`labels missing in ${REPO}: ${missing.join(', ')}`);
  const milestones = lines(
    gh.read(['api', `repos/${REPO}/milestones?state=all&per_page=100`, '--jq', '.[].title']),
  );
  if (!milestones.includes(MILESTONE)) throw new Error(`milestone "${MILESTONE}" is missing`);
}

function loadIssues(gh) {
  // A plain list (not a search) so a just-created issue is always seen on a rerun.
  return JSON.parse(
    gh.read([
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      'number,title,state,url',
    ]),
  );
}

function loadTicketsFromRepo(root) {
  const planText = fs.readFileSync(path.join(root, PLAN_PATH), 'utf8');
  const out = run(
    process.execPath,
    [path.join(root, '.claude/hooks/bin/plan-tasks.mjs'), PLAN_PATH],
    {
      cwd: root,
    },
  );
  return { planText, tickets: buildTickets(planText, JSON.parse(out)) };
}

function createIssue(gh, plan) {
  const args = [
    'issue',
    'create',
    '--repo',
    REPO,
    '--title',
    plan.title,
    '--milestone',
    plan.milestone,
    '--body-file',
    '-',
    ...plan.labels.flatMap((label) => ['--label', label]),
  ];
  const url = gh.mutate(args, { input: plan.body }).trim().split('\n').pop().trim();
  return { number: issueNumberFromUrl(url), url };
}

function closeIssue(gh, number) {
  gh.mutate([
    'issue',
    'close',
    assertPositiveInt(number, 'issue number'),
    '--repo',
    REPO,
    '--reason',
    'completed',
  ]);
}

function addToBoard(gh, url) {
  const out = gh.mutate([
    'project',
    'item-add',
    PROJECT_NUMBER,
    '--owner',
    OWNER,
    '--url',
    url,
    '--format',
    'json',
  ]);
  return assertNodeId(JSON.parse(out).id, 'project item');
}

function setFields(gh, board, itemId, plan) {
  const base = ['project', 'item-edit', '--id', itemId, '--project-id', board.projectId];
  for (const [name, value] of Object.entries(plan.fields)) {
    const flag = typeof value === 'number' ? '--number' : '--text';
    gh.mutate([...base, '--field-id', board.fieldId(name), flag, String(value)]);
  }
  gh.mutate([
    ...base,
    '--field-id',
    board.fieldId('Status'),
    '--single-select-option-id',
    board.statusOptionId(plan.status),
  ]);
}

function printPlan(plan, commits) {
  const shas =
    commits.length === 0 ? 'none found' : commits.map((c) => c.sha.slice(0, 7)).join(', ');
  console.log(`  title:     ${plan.title}`);
  console.log(`  labels:    ${plan.labels.join(', ')}`);
  console.log(`  milestone: ${plan.milestone}`);
  console.log(`  state:     ${plan.state}`);
  console.log(`  status:    ${plan.status}`);
  console.log(`  fields:    ${JSON.stringify(plan.fields)} (Attempts, Est. vs actual blank)`);
  console.log(`  commits:   ${shas}`);
  console.log('  body (first lines):');
  for (const line of previewBody(plan.body)) console.log(`    | ${line}`);
}

function ensureIssue({ gh, issues, ticket, plan, created }) {
  const existing = findExistingIssue(issues, ticket.id);
  if (existing) {
    const number = assertPositiveInt(existing.number, 'issue number');
    if (!isOpenTicket(ticket) && existing.state === 'OPEN') closeIssue(gh, number);
    return { existed: true, number, url: existing.url };
  }
  const { number, url } = createIssue(gh, plan);
  created.push(ticket.id);
  if (!isOpenTicket(ticket)) closeIssue(gh, number);
  return { existed: false, number, url };
}

function processTicket({ gh, board, issues, ticket, commits, waveNames, apply, created }) {
  const plan = describePlan(ticket, commits, waveNames);
  if (!apply) {
    printPlan(plan, commits);
    const existing = findExistingIssue(issues, ticket.id);
    console.log(
      existing
        ? `exists: ${ticket.id} -> #${existing.number}`
        : `would create: ${ticket.id} -> #(new)`,
    );
    return Boolean(existing);
  }
  const issue = ensureIssue({ gh, issues, ticket, plan, created });
  setFields(gh, board, addToBoard(gh, issue.url), plan);
  console.log(`${issue.existed ? 'exists' : 'created'}: ${ticket.id} -> #${issue.number}`);
  return issue.existed;
}

export function main(argv) {
  const unknown = argv.filter((arg) => arg !== '--apply');
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  const apply = argv.includes('--apply');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const gh = makeGh(apply);

  requireOwner(gh);
  const { planText, tickets } = loadTicketsFromRepo(root);
  const waveNames = parseWaveNames(planText);
  const commitsById = matchCommits(
    tickets,
    run('git', ['log', 'origin/main', '--format=%H%x09%s'], { cwd: root }),
  );
  const board = loadBoard(gh);
  verifyLabelsAndMilestone(gh, tickets);
  const issues = loadIssues(gh);

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: ${tickets.length} Plan 1c tickets -> board ${OWNER}/projects/${PROJECT_NUMBER}`,
  );
  let existed = 0;
  const failures = [];
  const created = [];
  for (const ticket of tickets) {
    console.log(`\n== ${ticket.id}`);
    try {
      const commits = commitsById.get(ticket.id) ?? [];
      if (processTicket({ gh, board, issues, ticket, commits, waveNames, apply, created }))
        existed += 1;
      if (apply) sleep(PAUSE_MS);
    } catch (error) {
      failures.push(ticket.id);
      console.error(
        `FAILED: ${ticket.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const newCount = apply ? created.length : tickets.length - existed - failures.length;
  console.log(
    `\nsummary: ${tickets.length} tickets; ${apply ? 'created' : 'would create'} ${newCount}; exists ${existed}; failed ${failures.length}`,
  );
  if (failures.length > 0) {
    console.error(`failed tickets (a rerun is safe): ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

const isEntry =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntry) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`backfill-plan-1c: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
