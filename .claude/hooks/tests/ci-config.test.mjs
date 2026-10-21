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
  it('waits for the quality gate', () => {
    const text = fs.readFileSync(path.join(repoRoot, 'sonar-project.properties'), 'utf8');
    expect(text).toMatch(/^sonar\.qualitygate\.wait=true$/m);
  });
});
