/**
 * @typedef {{ purpose: string, owner: string, created: string, expires: string | null, keepIf: string | null }} ScratchHeader
 */

const FIELD_NAMES = ['purpose', 'owner', 'created', 'expires', 'keep-if'];
const FIELD_PATTERN = new RegExp(`^(${FIELD_NAMES.join('|')})\\s*:\\s*(.+?)\\s*$`);

/** Drops a leading `//` comment marker and blanks out YAML front-matter fences (`---`). */
function stripCommentMarker(line) {
  if (line.trim() === '---') return '';
  return line.replace(/^\s*\/\/\s?/, '');
}

/** Removes a trailing `# ...` documentation comment from a field value. */
function stripTrailingComment(value) {
  return value.replace(/\s+#.*$/, '').trim();
}

/**
 * Parses a scratch-file header (spec §8.6) from either YAML front-matter or a
 * leading `//` comment block. Returns `null` unless `purpose`, `owner`,
 * `created` and `expires` are all present (expiry drives the whole scheme, so
 * it is mandatory); `keepIf` alone is `null` when omitted.
 *
 * @param {string} text
 * @returns {ScratchHeader | null}
 */
export function parseScratchHeader(text) {
  /** @type {Record<string, string>} */
  const fields = {};

  for (const rawLine of text.split('\n')) {
    const match = stripCommentMarker(rawLine).match(FIELD_PATTERN);
    if (match) {
      fields[match[1]] = stripTrailingComment(match[2]);
    }
  }

  if (!fields.purpose || !fields.owner || !fields.created || !fields.expires) {
    return null;
  }

  return {
    purpose: fields.purpose,
    owner: fields.owner,
    created: fields.created,
    expires: fields.expires,
    keepIf: fields['keep-if'] ?? null,
  };
}

/**
 * True once `todayIso` is strictly after the header's `expires` date.
 * A header with no `expires` recorded never expires.
 *
 * @param {{ expires?: string | null }} header
 * @param {string} todayIso
 * @returns {boolean}
 */
export function isExpired(header, todayIso) {
  if (!header?.expires) return false;
  return todayIso > header.expires;
}
