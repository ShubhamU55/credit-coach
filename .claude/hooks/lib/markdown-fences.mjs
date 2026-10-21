/**
 * Shared fenced-code-block detection for the repo's content checks (agent
 * lint, config audit). Follows CommonMark's fenced-code-block rules
 * closely enough to matter here:
 *
 * - An opening fence is a run of >= 3 backticks or >= 3 tildes, with up
 *   to 3 spaces of indentation and an optional info string.
 * - It closes only on a line made of the SAME character, with a run
 *   length >= the opener's, up to 3 spaces of indentation, and nothing
 *   else after it except trailing whitespace.
 * - An unclosed fence runs to the end of the file.
 *
 * Without tracking which character and run length opened the fence, a
 * mismatched delimiter (a stray ~~~ inside a ``` fence, or vice versa) or
 * a shorter run of the same character would be read as closing the
 * fence early, re-exposing hidden content to every check built on this
 * helper.
 */

/** The fence marker on `line` (up to 3 spaces of indent, a run of `` ` `` or `~`, then the rest of the line), or `null` if there isn't one. */
function matchFenceMarker(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  return { char: match[1][0], length: match[1].length, rest: match[2] };
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
