/**
 * Shared fenced-code-block detection for the repo's content checks (agent
 * lint, config audit). Follows CommonMark's fenced-code-block rules
 * closely enough to matter here:
 *
 * - An opening fence is a run of >= 3 backticks or >= 3 tildes, with up
 *   to 3 columns of indentation (tabs expand to the next 4-column tab
 *   stop) and an optional info string. A backtick-fence info string may
 *   not itself contain a backtick — that line is not an opener at all,
 *   just ordinary text; a tilde-fence info string has no such limit.
 * - It closes only on a line made of the SAME character, with a run
 *   length >= the opener's, up to 3 columns of indentation, and nothing
 *   else after it except trailing whitespace.
 * - An unclosed fence runs to the end of the file.
 *
 * Without tracking which character and run length opened the fence, a
 * mismatched delimiter (a stray ~~~ inside a ``` fence, or vice versa) or
 * a shorter run of the same character would be read as closing the
 * fence early, re-exposing hidden content to every check built on this
 * helper. Without the backtick-info-string rule, a line like
 * ```` ```includes`backtick ```` would be read as an opener, hiding
 * whatever follows (e.g. a `curl | sh` line) from every check until the
 * real closing fence.
 */

/**
 * The width of `line`'s leading indentation, expanding each tab to the
 * next 4-column tab stop (CommonMark), not just counting characters —
 * a single leading tab is indentation width 4, past the fence limit of
 * 3, even though it's one character.
 */
function leadingIndentWidth(line) {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') {
      width += 1;
    } else if (ch === '\t') {
      width += 4 - (width % 4);
    } else {
      break;
    }
    if (width > 3) break;
  }
  return width;
}

/** The fence marker on `line` (<= 3 columns of indent, a run of `` ` `` or `~`, then the rest of the line), or `null` if there isn't one. */
function matchFenceMarker(line) {
  if (leadingIndentWidth(line) > 3) return null;

  const unindented = line.replace(/^[ \t]+/, '');
  const match = unindented.match(/^(`{3,}|~{3,})(.*)$/);
  if (!match) return null;

  const char = match[1][0];
  const length = match[1].length;
  const info = match[2];

  // A backtick fence's info string may not contain a backtick (CommonMark);
  // a tilde fence has no such restriction.
  if (char === '`' && info.includes('`')) return null;

  return { char, length, rest: info };
}

/** True when `marker` validly closes a fence opened with `openFence`. */
function closesFence(marker, openFence) {
  return (
    marker !== null &&
    marker.char === openFence.char &&
    marker.length >= openFence.length &&
    marker.rest.trim() === ''
  );
}

/**
 * Lines of `text` with every fenced code block removed — fence marker
 * lines and everything between them — as `{ lineNumber, text }` pairs
 * (1-based `lineNumber`, matching the original file).
 */
export function linesOutsideFences(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let openFence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = matchFenceMarker(line);

    if (openFence) {
      if (closesFence(marker, openFence)) openFence = null;
      continue;
    }

    if (marker) {
      openFence = { char: marker.char, length: marker.length };
      continue;
    }

    result.push({ lineNumber: i + 1, text: line });
  }

  return result;
}
