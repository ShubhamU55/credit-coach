import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const WORKFLOW_PATHS = {
  ci: '.github/workflows/ci.yml',
  hold: '.github/workflows/hold.yml',
  codeql: '.github/workflows/codeql.yml',
  'pr-body': '.github/workflows/pr-body.yml',
};

function readWorkflow(relPath) {
  return parse(fs.readFileSync(path.join(repoRoot, relPath), 'utf8'));
}

function ifText(value) {
  return Array.isArray(value) ? value.join(' ') : String(value ?? '');
}

describe('workflow triggers never filter by path', () => {
  for (const [name, relPath] of Object.entries(WORKFLOW_PATHS)) {
    it(`${name}: on.* has no paths or paths-ignore`, () => {
      const doc = readWorkflow(relPath);
      // YAML parses the bare key `on` as boolean `true`; look it up either way.
      const on = doc.on ?? doc[true] ?? {};
      for (const trigger of Object.values(on)) {
        if (trigger && typeof trigger === 'object') {
          expect(trigger.paths).toBeUndefined();
          expect(trigger['paths-ignore']).toBeUndefined();
        }
      }
    });
  }
});

describe('.github/workflows/ci.yml', () => {
  let ci;
  beforeAll(() => {
    ci = readWorkflow(WORKFLOW_PATHS.ci);
  });

  it('pull_request.types does not include labeled/unlabeled', () => {
    const types = ci.on.pull_request?.types ?? [];
    expect(types).not.toContain('labeled');
    expect(types).not.toContain('unlabeled');
  });

  it('declares every required job id', () => {
    const ids = ['changes', 'verify', 'admin-e2e', 'secrets', 'deps', 'sonar', 'maestro-evidence'];
    for (const id of ids) {
      expect(ci.jobs).toHaveProperty(id);
    }
  });

  it('declares minimal top-level permissions', () => {
    expect(ci.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
  });

  it('deps runs pnpm audit at the high severity level', () => {
    const auditStep = ci.jobs.deps.steps.find((step) => /pnpm audit/.test(step.run ?? ''));
    expect(auditStep).toBeDefined();
    expect(auditStep.run).toContain('--audit-level=high');
  });

  it('SONAR_TOKEN is only ever exposed in the scan step env, never at job scope', () => {
    const sonarJob = ci.jobs.sonar;
    expect(Object.keys(sonarJob.env ?? {})).toEqual(['HAS_SONAR']);

    // A step's `run:` text is allowed to mention the string "SONAR_TOKEN" in
    // a log message (e.g. "Sonar skipped: SONAR_TOKEN not set"); only a
    // `secrets.SONAR_TOKEN` reference exposes the real value to a step.
    const stepsReferencingSecret = sonarJob.steps.filter((step) =>
      JSON.stringify(step).includes('secrets.SONAR_TOKEN'),
    );
    expect(stepsReferencingSecret).toHaveLength(1);
    expect(stepsReferencingSecret[0].uses).toContain('sonarqube-scan-action');
  });

  it('every job name equals its job id', () => {
    for (const [id, job] of Object.entries(ci.jobs)) {
      expect(job.name).toBe(id);
    }
  });

  it.each(['admin-e2e', 'maestro-evidence'])(
    '%s needs the changes job and gates on its outputs',
    (id) => {
      const job = ci.jobs[id];
      const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
      expect(needs).toContain('changes');
      expect(ifText(job.if)).toContain('needs.changes.outputs');
    },
  );
});

describe('third-party actions are pinned to a commit SHA', () => {
  // `yaml` drops comments, so scan the raw text for `uses:` lines.
  const FIRST_PARTY = /^(actions|github)\//;
  for (const [name, relPath] of Object.entries(WORKFLOW_PATHS)) {
    const lines = fs.readFileSync(path.join(repoRoot, relPath), 'utf8').split(/\r?\n/);
    const thirdParty = lines
      .map((line) => line.match(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/))
      .filter(Boolean)
      .filter(([, ref]) => !FIRST_PARTY.test(ref) && !ref.startsWith('./'));

    it(`${name}: every third-party uses: is @<40-hex sha> with a trailing # version comment`, () => {
      for (const [line, ref, rest] of thirdParty) {
        expect(ref, line).toMatch(/@[0-9a-f]{40}$/);
        expect(rest, line).toMatch(/^\s+#\s*\S+/);
      }
    });
  }

  it('ci: the scan finds the third-party actions it is meant to pin', () => {
    const text = fs.readFileSync(path.join(repoRoot, WORKFLOW_PATHS.ci), 'utf8');
    for (const action of [
      'dorny/paths-filter',
      'pnpm/action-setup',
      'gitleaks/gitleaks-action',
      'SonarSource/sonarqube-scan-action',
      'google/osv-scanner-action/osv-scanner-action',
    ]) {
      expect(text).toContain(action);
    }
  });
});

describe('ci.yml hardening', () => {
  let ci;
  beforeAll(() => {
    ci = readWorkflow(WORKFLOW_PATHS.ci);
  });

  it('deps installs with --ignore-scripts so a dependency install script never runs', () => {
    const installSteps = ci.jobs.deps.steps.filter((step) => /pnpm install/.test(step.run ?? ''));
    expect(installSteps).toHaveLength(1);
    expect(installSteps[0].run).toContain('--ignore-scripts');
  });

  it("sonar fails when SONAR_REQUIRED is 'true' and the token is absent", () => {
    const failStep = ci.jobs.sonar.steps.find(
      (step) => /exit 1/.test(step.run ?? '') && /vars\.SONAR_REQUIRED/.test(ifText(step.if)),
    );
    expect(failStep).toBeDefined();
    expect(ifText(failStep.if)).toContain("vars.SONAR_REQUIRED == 'true'");
    expect(ifText(failStep.if)).toContain("env.HAS_SONAR != 'true'");
  });

  it('sonar still skips (warning, no failure) when not required and no token', () => {
    const skipStep = ci.jobs.sonar.steps.find((step) => /Sonar skipped/.test(step.run ?? ''));
    expect(skipStep).toBeDefined();
    expect(skipStep.run).not.toMatch(/exit 1/);
    expect(ifText(skipStep.if)).toContain("env.HAS_SONAR != 'true'");
    expect(ifText(skipStep.if)).toContain("vars.SONAR_REQUIRED != 'true'");
  });

  it('sonar keeps its job id and name', () => {
    expect(ci.jobs.sonar.name).toBe('sonar');
  });
});

describe('.github/workflows/hold.yml', () => {
  let hold;
  beforeAll(() => {
    hold = readWorkflow(WORKFLOW_PATHS.hold);
  });

  it('triggers on labeled, unlabeled, opened, synchronize and reopened', () => {
    const types = hold.on.pull_request?.types ?? [];
    for (const type of ['labeled', 'unlabeled', 'opened', 'synchronize', 'reopened']) {
      expect(types).toContain(type);
    }
  });

  it('has its own concurrency group', () => {
    expect(hold.concurrency?.group).toBeTruthy();
  });

  it('declares empty top-level permissions (no token is needed)', () => {
    expect(hold.permissions).toEqual({});
  });

  it('declares the hold-check job named after its id', () => {
    expect(hold.jobs).toHaveProperty('hold-check');
    expect(hold.jobs['hold-check'].name).toBe('hold-check');
  });

  it("hold-check's failing step is conditioned on the hold label", () => {
    const steps = hold.jobs['hold-check'].steps;
    const failingStep = steps.find((step) => /exit 1/.test(step.run ?? ''));
    expect(failingStep).toBeDefined();
    expect(ifText(failingStep.if)).toContain('hold');
  });
});

describe('.github/workflows/codeql.yml', () => {
  let codeql;
  beforeAll(() => {
    codeql = readWorkflow(WORKFLOW_PATHS.codeql);
  });

  it('declares the codeql job named after its id', () => {
    expect(codeql.jobs).toHaveProperty('codeql');
    expect(codeql.jobs.codeql.name).toBe('codeql');
  });

  it('analyzes javascript-typescript', () => {
    expect(JSON.stringify(codeql)).toContain('javascript-typescript');
  });
});

describe('sonar-project.properties', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'sonar-project.properties'), 'utf8');

  /** The comma-separated values of `key`, or [] when it is absent. */
  function listProperty(key) {
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line
      ? line
          .slice(key.length + 1)
          .split(',')
          .map((v) => v.trim())
      : [];
  }

  it('waits for the quality gate', () => {
    expect(text).toMatch(/^sonar\.qualitygate\.wait=true$/m);
  });

  it('excludes the pasted contracts copies from duplication (CPD)', () => {
    expect(listProperty('sonar.cpd.exclusions')).toEqual([
      '.claude/workflows/**',
      '.claude/hooks/lib/contracts.mjs',
    ]);
  });

  it('excludes scratch/** from analysis', () => {
    expect(listProperty('sonar.exclusions')).toContain('scratch/**');
  });
});
