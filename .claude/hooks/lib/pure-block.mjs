// Extracts and evaluates the `// <contracts>` and `// <pure>` blocks of a workflow script, so
// the decision logic inside plain-JS workflow files can be unit-tested. Blocks run in a fresh
// `vm` context whose clock and randomness throw, mirroring the Workflow runtime.
import vm from 'node:vm';

export const WORKFLOW_GLOB = '.claude/workflows/*.workflow.js';

const BLOCK_TAGS = ['contracts', 'pure'];
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LOAD_TIMEOUT_MS = 5000;

// Runs inside the vm context before the blocks. `new Date(value)`, `Date.UTC` and `Date.parse`
// keep working; reading "now" or randomness throws, as it does in a Workflow script.
const NONDETERMINISM_GUARD = `(() => {
  const RealDate = Date;
  const fail = (what) => {
    throw new Error(what + ' is not allowed in workflow code; pass timestamps in args');
  };
  function GuardedDate(...args) {
    if (!new.target) fail('Date() called as a function');
    if (args.length === 0) fail('Argless new Date()');
    return Reflect.construct(RealDate, args, new.target);
  }
  Object.setPrototypeOf(GuardedDate, RealDate);
  GuardedDate.prototype = RealDate.prototype;
  GuardedDate.now = () => fail('Date.now()');
  globalThis.Date = GuardedDate;
  Math.random = () => fail('Math.random()');
})();`;

function markerLines(tag) {
  return { open: `// <${tag}>`, close: `// </${tag}>` };
}

function indexesOf(lines, marker) {
  return lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
}

function splitLines(source) {
  return String(source).replace(/\r\n/g, '\n').split('\n');
}

function hasMarker(source, tag) {
  const { open, close } = markerLines(tag);
  return splitLines(source).some((line) => line.trim() === open || line.trim() === close);
}

/**
 * Returns the lines strictly between `// <tag>` and `// </tag>` (LF line endings). Throws when
 * either marker is missing, repeated, or out of order.
 *
 * @param {string} source
 * @param {'contracts' | 'pure'} tag
 * @returns {string}
 */
export function extractBlock(source, tag) {
  const lines = splitLines(source);
  const { open, close } = markerLines(tag);
  const opens = indexesOf(lines, open);
  const closes = indexesOf(lines, close);

  if (opens.length === 0 || closes.length === 0) {
    throw new Error(`block "${tag}" is missing: expected "${open}" … "${close}"`);
  }
  if (opens.length > 1 || closes.length > 1) {
    throw new Error(`block "${tag}" is repeated: expected exactly one "${open}" … "${close}"`);
  }
  if (closes[0] < opens[0]) {
    throw new Error(`block "${tag}" is malformed: "${close}" comes before "${open}"`);
  }
  return lines.slice(opens[0] + 1, closes[0]).join('\n');
}

/**
 * Evaluates the source's `contracts` and `pure` blocks (each optional, at least one required)
 * together in a fresh vm context with the clock and randomness disabled, and returns the
 * requested top-level names. An unknown name throws a ReferenceError.
 *
 * @param {string} source
 * @param {string[]} names
 * @returns {Record<string, unknown>}
 */
export function loadBlocks(source, names) {
  const invalid = names.filter((name) => !IDENTIFIER.test(name));
  if (invalid.length > 0) {
    throw new Error(`loadBlocks: not an identifier: ${invalid.join(', ')}`);
  }

  const blocks = BLOCK_TAGS.filter((tag) => hasMarker(source, tag)).map((tag) =>
    extractBlock(source, tag),
  );
  if (blocks.length === 0) {
    throw new Error(`loadBlocks: no "contracts" or "pure" block found`);
  }

  const context = vm.createContext({});
  vm.runInContext(NONDETERMINISM_GUARD, context, { filename: 'nondeterminism-guard.js' });
  const script = `${blocks.join('\n')}\n;({ ${names.join(', ')} });\n`;
  return vm.runInContext(script, context, {
    filename: 'workflow-blocks.js',
    timeout: LOAD_TIMEOUT_MS,
  });
}
