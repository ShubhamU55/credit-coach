/**
 * @typedef {{ path: string, xml: string, afterLastMobileChange: boolean }} MaestroReport
 * @typedef {{ tests: number, failures: number, errors: number }} TestCounts
 */

/**
 * Extracts `tests`/`failures`/`errors` attribute values from a tag's attribute string.
 *
 * @param {string} attrs
 * @returns {TestCounts}
 */
function extractCounts(attrs) {
  const read = (name) => Number(attrs.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? 0);
  return { tests: read('tests'), failures: read('failures'), errors: read('errors') };
}

/**
 * Parses a JUnit-style Maestro report, accepting either a `<testsuites>` root
 * (summed across its `<testsuite>` children) or a bare `<testsuite>` root.
 *
 * @param {string} xml
 * @returns {TestCounts | null}
 */
function parseCounts(xml) {
  const suitesTag = xml.match(/<testsuites\b([^>]*)>/);
  if (suitesTag && /\btests="/.test(suitesTag[1])) {
    return extractCounts(suitesTag[1]);
  }

  const suiteTags = [...xml.matchAll(/<testsuite\b([^>]*)>/g)];
  if (suiteTags.length === 0) return null;

  return suiteTags.reduce(
    (totals, [, attrs]) => {
      const counts = extractCounts(attrs);
      return {
        tests: totals.tests + counts.tests,
        failures: totals.failures + counts.failures,
        errors: totals.errors + counts.errors,
      };
    },
    { tests: 0, failures: 0, errors: 0 },
  );
}

/**
 * Checks that the newest Maestro report qualifying as "after the last
 * apps/mobile change" (by git ancestry, not timestamp) recorded at least one
 * passing test and zero failures/errors. Reports are expected in chronological
 * order (oldest first); non-qualifying reports anywhere in the array,
 * including a stale trailing one, are ignored rather than treated as newest.
 *
 * @param {{ reports: MaestroReport[] }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkMaestroEvidence({ reports }) {
  if (!reports || reports.length === 0) {
    return { ok: false, reason: 'no Maestro report found' };
  }

  const qualifying = reports.filter((report) => report.afterLastMobileChange);
  if (qualifying.length === 0) {
    return { ok: false, reason: 'no report is newer than the last apps/mobile change' };
  }

  const newest = qualifying[qualifying.length - 1];
  const counts = parseCounts(newest.xml);
  if (!counts || counts.tests === 0) {
    return { ok: false, reason: `newest report (${newest.path}) recorded no tests` };
  }

  if (counts.failures > 0 || counts.errors > 0) {
    return {
      ok: false,
      reason: `newest report (${newest.path}) has ${counts.failures} failure(s) and ${counts.errors} error(s)`,
    };
  }

  return { ok: true, reason: `newest report (${newest.path}) passed ${counts.tests} test(s)` };
}
