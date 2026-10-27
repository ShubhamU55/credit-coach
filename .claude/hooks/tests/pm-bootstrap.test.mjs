import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const toPosix = (p) => p.split(path.sep).join('/');
const scriptPath = toPosix(path.join(repoRoot, 'scripts/pm/bootstrap-board.sh'));
const agentsDir = path.join(repoRoot, '.claude/agents');

/** Git Bash on Windows (the PATH `bash` there can be WSL); plain `bash` elsewhere. */
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}
const bash = findBash();

/**
 * A stateful fake `gh`. It keeps its "GitHub" in files under $STUB_DIR, answers only
 * the call shapes bootstrap-board.sh uses, and logs every call. Mutating calls are
 * logged as `MUTATION ...` lines so a test can assert none happened.
 */
const GH_STUB = `#!/usr/bin/env bash
D="$STUB_DIR"
echo "$*" >> "$D/calls.log"
mut() { echo "MUTATION $*" >> "$D/calls.log"; }
case "$*" in
  "api user --jq .login") echo "\${STUB_LOGIN:-ShubhamU55}" ;;
  "project list"*) if [ -f "$D/project" ]; then echo 7; fi ;;
  "project create"*) mut "$*"; touch "$D/project"; echo 7 ;;
  "project link"*) mut "$*"; touch "$D/linked" ;;
  "project field-create"*)
    name=""; type=""
    args=("$@")
    for ((i = 0; i < \${#args[@]}; i++)); do
      [ "\${args[$i]}" = "--name" ] && name="\${args[$((i + 1))]}"
      [ "\${args[$i]}" = "--data-type" ] && type="\${args[$((i + 1))]}"
    done
    mut "$*"
    printf '%s\\t%s\\n' "$name" "$type" >> "$D/fields"
    ;;
  "label list"*) if [ -f "$D/labels" ]; then cat "$D/labels"; fi ;;
  "label create"*) mut "$*"; echo "$3" >> "$D/labels" ;;
  "api --method POST repos/"*)
    mut "$*"
    for a in "$@"; do case "$a" in title=*) echo "\${a#title=}" >> "$D/milestones" ;; esac; done
    ;;
  "api repos/"*) if [ -f "$D/milestones" ]; then cat "$D/milestones"; fi ;;
  *"query RepoProjects"*) if [ -f "$D/linked" ]; then echo 7; fi ;;
  *"updateProjectV2Field"*)
    mut "$*"
    echo "$*" > "$D/status-mutation.txt"
    echo "Backlog~n1|Ready~n2|In progress~n3|Review~n4|Done~n5|Blocked~n6" > "$D/status"
    ;;
  *"query ProjectState"*)
    printf 'PROJECT\\tPVT_kwHOtest\\thttps://github.com/users/ShubhamU55/projects/7\\n'
    printf 'FIELD\\tPVTF_title\\tTitle\\tTEXT\\t\\n'
    if [ -f "$D/status" ]; then st="$(cat "$D/status")"; else st="Todo~t1|In Progress~t2|Done~t3"; fi
    printf 'FIELD\\tPVTSSF_status\\tStatus\\tSINGLE_SELECT\\t%s\\n' "$st"
    if [ -f "$D/fields" ]; then
      while IFS=$'\\t' read -r n t; do
        [ -n "$n" ] && printf 'FIELD\\tPVTF_%s\\t%s\\t%s\\t\\n' "\${n//[^A-Za-z0-9]/}" "$n" "$t"
      done < "$D/fields"
    fi
    ;;
  *) echo "stub gh: unexpected call: $*" >&2; exit 98 ;;
esac
`;

const BUG_FINDER_SUFFIXES = ['-tester', '-reviewer', '-hunter', '-checker', '-analyst'];
const agentNames = fs
  .readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''));

// Process creation is slow under Git Bash on Windows (about 30 s for a full real run).
const SLOW_TEST_TIMEOUT_MS = 180_000;

describe.skipIf(!bash)(
  'scripts/pm/bootstrap-board.sh (stubbed gh, no network)',
  { timeout: SLOW_TEST_TIMEOUT_MS },
  () => {
    let stubDir;

    beforeEach(() => {
      stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-bootstrap-'));
      fs.writeFileSync(path.join(stubDir, 'gh'), GH_STUB, { mode: 0o755 });
    });

    afterEach(() => {
      fs.rmSync(stubDir, { recursive: true, force: true });
    });

    function run(args = [], envOverrides = {}) {
      const env = {
        ...process.env,
        PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
        STUB_DIR: toPosix(stubDir),
        BOOTSTRAP_RETRY_SLEEP: '0',
        GH_TOKEN: 'stub-token',
        ...envOverrides,
      };
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
      const result = spawnSync(bash, [scriptPath, ...args], { env, encoding: 'utf8' });
      return { ...result, lines: result.stdout.split(/\r?\n/).filter(Boolean) };
    }

    const calls = () => {
      const file = path.join(stubDir, 'calls.log');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
    };
    const mutations = () => calls().filter((l) => l.startsWith('MUTATION '));

    it('refuses to run without GH_TOKEN', () => {
      const r = run([], { GH_TOKEN: undefined });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('GH_TOKEN');
      expect(calls()).toEqual([]);
    });

    it('refuses to run when the token is not ShubhamU55', () => {
      const r = run([], { STUB_LOGIN: 'ShubhamUpadhyay-Nibe' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('Refusing to run');
      expect(mutations()).toEqual([]);
    });

    it('rejects an unknown flag', () => {
      const r = run(['--yolo']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('unknown argument');
    });

    it('--dry-run on an empty account prints "would create" for every object and mutates nothing', () => {
      const r = run(['--dry-run']);
      expect(r.status, r.stderr).toBe(0);
      expect(mutations()).toEqual([]);
      expect(r.lines).toContain('would create: project "Credit Coach" (owner ShubhamU55)');
      expect(r.lines).toContain(
        'would create: Status options (Backlog, Ready, In progress, Review, Done, Blocked)',
      );
      for (const field of ['Plan', 'Task #', 'Wave', 'Agent', 'Attempts', 'Est. vs actual']) {
        expect(r.lines.some((l) => l.startsWith(`would create: field "${field}"`))).toBe(true);
      }
      for (const m of [
        'Foundation',
        'Agentic system',
        'Engine',
        'Backend',
        'UI kit',
        'Screens',
        'Admin',
        'Submission',
      ]) {
        expect(r.lines).toContain(`would create: milestone "${m}"`);
      }
      for (const l of [
        'severity:critical',
        'area:engine',
        'blocked',
        'escalated',
        'cannot-reproduce',
        'triaged',
        'found-by:owner',
      ]) {
        expect(r.lines).toContain(`would create: label ${l}`);
      }
      expect(r.lines.filter((l) => l.startsWith('exists:'))).toEqual([]);
    });

    it('creates agent:<name> for every agent file and found-by:<name> only for bug-finding agents', () => {
      const r = run(['--dry-run']);
      expect(r.status, r.stderr).toBe(0);
      expect(agentNames.length).toBeGreaterThan(0);
      for (const name of agentNames) {
        expect(r.lines).toContain(`would create: label agent:${name}`);
        const finds = BUG_FINDER_SUFFIXES.some((s) => name.endsWith(s));
        expect(r.lines.includes(`would create: label found-by:${name}`)).toBe(finds);
      }
    });

    it('never creates session:* labels and never touches bug or hold', () => {
      const r = run(['--dry-run']);
      expect(r.lines.some((l) => /label session:/.test(l))).toBe(false);
      expect(r.lines.some((l) => /label (bug|hold)$/.test(l))).toBe(false);
    });

    it('a real run creates everything once, and a second run creates nothing', () => {
      const first = run();
      expect(first.status, first.stderr).toBe(0);
      expect(first.lines).toContain('created: project "Credit Coach" (#7)');
      expect(first.lines).toContain('created: link project #7 -> ShubhamU55/credit-coach');
      expect(first.lines).toContain(
        'created: Status options (Backlog, Ready, In progress, Review, Done, Blocked)',
      );
      expect(first.lines).toContain('project: https://github.com/users/ShubhamU55/projects/7');
      expect(first.lines.some((l) => l.startsWith('would create'))).toBe(false);

      const afterFirst = mutations().length;
      expect(afterFirst).toBeGreaterThan(0);
      const labelCreates = calls().filter((l) => l.startsWith('MUTATION label create'));
      expect(
        labelCreates.every((l) => /--color [0-9A-F]{6} /.test(l) && l.endsWith('--force')),
      ).toBe(true);

      const second = run();
      expect(second.status, second.stderr).toBe(0);
      expect(mutations().length).toBe(afterFirst);
      expect(second.lines.filter((l) => /^(created|would create):/.test(l))).toEqual([]);
      expect(second.lines.filter((l) => l.startsWith('exists:')).length).toBeGreaterThan(50);
      expect(second.lines).toContain('project: https://github.com/users/ShubhamU55/projects/7');
    });

    it('replaces the Status options with the six columns in order and keeps ids of options that already match by name', () => {
      fs.writeFileSync(path.join(stubDir, 'project'), '');
      fs.writeFileSync(path.join(stubDir, 'linked'), '');
      fs.writeFileSync(path.join(stubDir, 'status'), 'Todo~t1|Done~keepDone|Backlog~keepBacklog');

      const r = run();
      expect(r.status, r.stderr).toBe(0);
      const mutation = fs.readFileSync(path.join(stubDir, 'status-mutation.txt'), 'utf8');
      const order = ['Backlog', 'Ready', 'In progress', 'Review', 'Done', 'Blocked'].map((n) =>
        mutation.indexOf(`name: "${n}"`),
      );
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(mutation).toContain('{id: "keepBacklog", name: "Backlog"');
      expect(mutation).toContain('{id: "keepDone", name: "Done"');
      expect(mutation).not.toContain('"t1"');
      expect(mutation).toContain('singleSelectOptions');
      expect(r.lines).toContain('exists: project "Credit Coach" (#7)');
      expect(r.lines).toContain('exists: link project #7 -> ShubhamU55/credit-coach');
    });

    it('fails loudly when an existing field has the wrong data type', () => {
      fs.writeFileSync(path.join(stubDir, 'project'), '');
      fs.writeFileSync(path.join(stubDir, 'linked'), '');
      fs.writeFileSync(
        path.join(stubDir, 'status'),
        'Backlog~a|Ready~b|In progress~c|Review~d|Done~e|Blocked~f',
      );
      fs.writeFileSync(path.join(stubDir, 'fields'), 'Plan\tNUMBER\n');

      const r = run();
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('field "Plan" exists with type NUMBER, expected TEXT');
    });
  },
);
