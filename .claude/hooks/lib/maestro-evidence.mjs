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
 * Counts occurrences of an XML element's opening tag (self-closed, with
 * attributes, or not), e.g. `<failure/>` or `<failure message="...">`.
 * Requires a non-word character right after the name so `<error>` doesn't
 * false-match inside `<testsuite errors="1">`.
 *
 * @param {string} xml
 * @param {string} tagName
 * @returns {number}
 */
function countElement(xml, tagName) {
  const matches = xml.match(new RegExp(`<${tagName}(?=[\\s/>])`, 'g'));
  return matches ? matches.length : 0;
}

/**
 * Parses a JUnit-style Maestro report, accepting either a `<testsuites>` root
 * or a bare `<testsuite>` root. Always sums the `<testsuite>` children's own
 * counts rather than trusting a `<testsuites>` root's aggregate attributes,
 * which can go stale or be absent entirely. A literal `<failure>`/`<error>`
 * element (e.g. inside a `<testcase>`) counts as a failure/error even when no
 * suite-level attribute reports it.
 *
 * @param {string} xml
 * @returns {TestCounts | null}
 */
function parseCounts(xml) {
  const suiteTags = [...xml.matchAll(/<testsuite\b([^>]*)>/g)];
  if (suiteTags.length === 0) return null;

  const attrTotals = suiteTags.reduce(
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

  return {
    tests: attrTotals.tests,
    failures: Math.max(attrTotals.failures, countElement(xml, 'failure')),
    errors: Math.max(attrTotals.errors, countElement(xml, 'error')),
  };
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
