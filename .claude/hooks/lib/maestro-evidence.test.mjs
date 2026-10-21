import { describe, it, expect } from 'vitest';
import { checkMaestroEvidence } from './maestro-evidence.mjs';

const PASSING_TESTSUITE = '<testsuite name="demo" tests="3" failures="0" errors="0"></testsuite>';
const PASSING_TESTSUITES =
  '<testsuites><testsuite name="demo" tests="3" failures="0" errors="0"></testsuite></testsuites>';
const FAILING_TESTSUITE = '<testsuite name="demo" tests="3" failures="1" errors="0"></testsuite>';
const EMPTY_TESTSUITE = '<testsuite name="demo" tests="0" failures="0" errors="0"></testsuite>';

function report(overrides) {
  return { path: 'report.xml', xml: PASSING_TESTSUITE, afterLastMobileChange: true, ...overrides };
}

describe('checkMaestroEvidence', () => {
  it('fails when there is no report', () => {
    const result = checkMaestroEvidence({ reports: [] });
    expect(result.ok).toBe(false);
  });

  it('fails when the newest report is not after the last mobile change', () => {
    const result = checkMaestroEvidence({ reports: [report({ afterLastMobileChange: false })] });
    expect(result.ok).toBe(false);
  });

  it('fails on a recorded failure', () => {
    const result = checkMaestroEvidence({ reports: [report({ xml: FAILING_TESTSUITE })] });
    expect(result.ok).toBe(false);
  });

  it('fails when zero tests were recorded', () => {
    const result = checkMaestroEvidence({ reports: [report({ xml: EMPTY_TESTSUITE })] });
    expect(result.ok).toBe(false);
  });

  it('passes for the newest qualifying report with tests and no failures', () => {
    const result = checkMaestroEvidence({ reports: [report()] });
    expect(result.ok).toBe(true);
  });

  it('parses both a <testsuites> root and a <testsuite> root', () => {
    const fromSuite = checkMaestroEvidence({ reports: [report({ xml: PASSING_TESTSUITE })] });
    const fromSuites = checkMaestroEvidence({ reports: [report({ xml: PASSING_TESTSUITES })] });
    expect(fromSuite.ok).toBe(true);
    expect(fromSuites.ok).toBe(true);
  });

  it('only requires the newest qualifying report to pass', () => {
    const olderFailing = report({ path: 'old.xml', xml: FAILING_TESTSUITE });
    const newestPassing = report({ path: 'new.xml', xml: PASSING_TESTSUITE });
    const result = checkMaestroEvidence({ reports: [olderFailing, newestPassing] });
    expect(result.ok).toBe(true);
  });

  it('skips a trailing non-qualifying report and uses the newest qualifying one', () => {
    const qualifyingPass = report({
      path: 'qualifying.xml',
      xml: PASSING_TESTSUITE,
      afterLastMobileChange: true,
    });
    const nonQualifying = report({
      path: 'stale.xml',
      xml: FAILING_TESTSUITE,
      afterLastMobileChange: false,
    });
    const result = checkMaestroEvidence({ reports: [qualifyingPass, nonQualifying] });
    expect(result.ok).toBe(true);
  });
});
