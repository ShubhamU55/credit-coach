// Fix round 1: the controller's Opus task review found real bypasses in the
// first pass at pre-bash-commit-quality.cjs — mostly because commit
// detection used to be a substring check (`command.includes('git commit')`)
// instead of real shell parsing. This file is the bypass matrix the review
// listed, each case named after the review's own wording so it is easy to
// cross-reference against the fix-round report.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.resolve(here, '..');
const preBashCommitQualityPath = pathToFileURL(
  path.join(hooksDir, 'pre-bash-commit-quality.cjs'),
).href;

async function hook() {
  return import(preBashCommitQualityPath);
}

function isBlocked(result) {
  return result !== null && result.issues.length > 0;
}

describe('commit-hook: commits detected by parsing, not substrings', () => {
  it('detects a commit behind a `-c key=value` global option', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git -c user.name=x commit -m "bad subject"');
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('detects a commit behind a `-C <dir>` global option', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git -C . commit -m "bad subject"');
    expect(isBlocked(result)).toBe(true);
  });

  it('detects a commit separated from `git` by a double space', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git  commit -m "bad subject"');
    expect(isBlocked(result)).toBe(true);
  });

  it('does NOT trigger on a non-git command that merely quotes "git commit"', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('grep -m 1 "git commit" CLAUDE.md');
    expect(result).toBeNull();
  });

  it('evaluate() exits 0 for that same non-git command', async () => {
    const { evaluate } = await hook();
    const rawInput = JSON.stringify({
      tool_input: { command: 'grep -m 1 "git commit" CLAUDE.md' },
    });
    const result = await evaluate(rawInput);
    expect(result.exitCode).toBe(0);
  });

  // `JSON.parse('null')` succeeds (returns null) rather than throwing, so a
  // bare `input.tool_input` (no `?.`) would throw OUTSIDE the JSON.parse
  // try/catch and crash the hook process on a malformed/null payload.
  it('does not throw and exits 0 for a JSON `null` payload', async () => {
    const { evaluate } = await hook();
    const result = await evaluate('null');
    expect(result.exitCode).toBe(0);
  });

  it('skips past a leading GIT_* environment-variable prefix to find the commit', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("GIT_AUTHOR_NAME=x git commit -m 'feat: ok'");
    expect(result).not.toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.message).toBe('feat: ok');
  });

  it('finds a bad second commit chained with &&', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: ok" && git commit --allow-empty -m "bad subject"',
    );
    expect(isBlocked(result)).toBe(true);
  });
});

// Fix round 2: a fresh Opus re-review of the fix-round-1 commit (0d913bb)
// found these bypasses still open. Each describe block below is named after
// the review's own item id so it's easy to cross-reference against the
// fix-round-2 report and findings file
// (task-W1-4-fix2-findings.md).
describe('commit-hook: N1 - brace-expansion / unquoted-value bypass is blocked', () => {
  // Bash expands `-m{,}'Co-Authored-By: X'` into the attached text
  // `-mCo-Authored-By: X` BEFORE git ever runs — but the vendored scanner's
  // own `dynamic` flag only tracks `$(...)`/backtick, so the pre-expansion
  // token (still containing the literal `{,}` noise) was read and
  // validated instead, and the anchored attribution regexes never matched
  // past that noise.
  it('blocks a brace-expanded Co-Authored-By trailer attached to -m', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'feat: ok' -m{,}'Co-Authored-By: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  it('blocks a brace-expanded --message= value', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'feat: ok' --message={,}'Co-authored-by: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  it('blocks a brace-expanded --trailer= value', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'feat: ok' --trailer={,}'Co-authored-by: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  it('blocks "Generated with" split across an unquoted brace fragment', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'feat: ok' -m'Gen'{,}'erated with Claude Code'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  // Regression guard for the fix itself: the --trailer= inline construction
  // used to slice its "raw" text from the DEQUOTED word value (which never
  // carries quote characters at all), so a perfectly ordinary, fully
  // single-quoted --trailer= value would have been wrongly rejected as
  // unreadable instead of being read and flagged as attribution.
  it('still reads a legitimately single-quoted --trailer= inline value (not unreadable)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'feat: ok' --trailer='Co-authored-by: Claude <x@y>'",
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(
      false,
    );
  });
});

describe('commit-hook: N2 - wrapped commits are still detected (regression vs. 702cb8f)', () => {
  it.each([
    ['env wrapper', 'env git commit -m "bad subject"'],
    ['command wrapper', 'command git commit -m "bad subject"'],
    ['time wrapper', 'time git commit -m "bad subject"'],
    ['! wrapper', '! git commit -m "bad subject"'],
    ['if/then/fi wrapper', 'if true; then git commit -m "bad subject"; fi'],
    ['bash -c wrapper', `bash -c 'git commit -m "bad subject"'`],
    ['command substitution', 'echo $(git commit -m "bad subject")'],
  ])('detects a commit wrapped by: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('detects a wrapped commit chained with &&', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('env git commit -m "bad subject" && echo done');
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  // Advisor review round (fix round 2, second pass): `if`'s own CONDITION
  // command (not just its then/else body) runs directly, and was missing
  // from the wrapper-skip set.
  it('detects a commit as the condition of an if (not just its then-body)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('if git commit -m "bad subject"; then :; fi');
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  // Advisor review round: a shell -c invocation is not always a bare `-c` —
  // a combined option cluster (`-lc`, `-ec`) or a preceding long flag
  // (`--norc`) is common, and other POSIX shells (dash/zsh/ksh) use the
  // same `-c` convention.
  it.each([
    ['bash -lc (combined option cluster)', `bash -lc 'git commit -m "bad subject"'`],
    ['sh -ec (combined option cluster)', `sh -ec 'git commit -m "bad subject"'`],
    ['bash --norc -c (a preceding long flag)', `bash --norc -c 'git commit -m "bad subject"'`],
    ['dash -c', `dash -c 'git commit -m "bad subject"'`],
    ['zsh -c', `zsh -c 'git commit -m "bad subject"'`],
    ['ksh -c', `ksh -c 'git commit -m "bad subject"'`],
  ])('detects a commit wrapped by: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  // Advisor review round: a -c argument built with an outer-shell variable
  // reference (not a plain single-quoted literal) was treated as opaque and
  // skipped entirely (fail-open — the commit became invisible). It must
  // still be recursed into; the variable reference itself then correctly
  // fails closed as an unreadable message value, rather than the whole
  // commit going undetected.
  it('still finds a commit inside a -c argument carrying a $VAR reference (fails closed on the value, not invisible)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(`bash -c "git commit -m \\"$MSG\\""`);
    expect(result).not.toBeNull();
    expect(isBlocked(result)).toBe(true);
  });

  // Advisor review round: a wrapper's OWN option (`env -i`, `command -p`,
  // `time -p`) must not stop the unwrapping from reaching the real `git`
  // word.
  it.each([
    ['env -i wrapper', 'env -i git commit -m "bad subject"'],
    ['command -p wrapper', 'command -p git commit -m "bad subject"'],
    ['time -p wrapper', 'time -p git commit -m "bad subject"'],
  ])('detects a commit wrapped by: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });
});

describe('commit-hook: N3 - trailer-key alias evasion is blocked outright', () => {
  it('blocks a -c trailer.*.key alias ahead of commit', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git -c trailer.co.key=Co-authored-by commit -m 'feat: ok' --trailer 'co: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-unsafe-config'))).toBe(true);
  });

  // Advisor review round: the SAME alias, expressed as a leading
  // GIT_CONFIG_COUNT/KEY_n/VALUE_n environment-variable prefix instead of
  // `-c` — git reads this form identically, and it is just as visible in
  // the command text.
  it('blocks the same alias expressed as a GIT_CONFIG_* environment-variable prefix', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=trailer.co.key GIT_CONFIG_VALUE_0=Co-authored-by ' +
        "git commit -m 'feat: ok' --trailer 'co: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-unsafe-config'))).toBe(true);
  });

  // A1's existing case must still pass: an ordinary -c setting unrelated to
  // trailer-key aliasing is not blocked by this new check.
  it('still allows a plain -c user.name=x ahead of commit', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git -c user.name=x commit -m 'feat: ok'");
    expect(result.issues).toEqual([]);
  });

  // Regression guard: an ordinary GIT_AUTHOR_NAME=x prefix (A1's existing
  // environment-variable case) must still pass — only GIT_CONFIG_KEY_n
  // values matching the trailer-key-alias pattern are blocked.
  it('still allows an ordinary GIT_AUTHOR_NAME=x environment-variable prefix', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("GIT_AUTHOR_NAME=x git commit -m 'feat: ok'");
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: N5 - an attached value on a short-flag cluster is read, not the next word', () => {
  it("reads the attached value of -am'...', not the following word", async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git commit -am'style: bad' 'feat: ok'");
    expect(result.message).toBe('style: bad');
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it("reads the attached value of a whole-word-quoted '-mstyle: bad', not the following word", async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git commit '-mstyle: bad' 'feat: ok'");
    expect(result.message).toBe('style: bad');
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  // Regression guard: a bare cluster with nothing attached still reads the
  // NEXT word as its value, same as before this fix.
  it('still reads a bare -am cluster value from the next word', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -am "feat: ok"');
    expect(result.message).toBe('feat: ok');
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: --amend is blocked as a parsed flag, with or without -m', () => {
  it('blocks --amend with a message', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit --amend -m "feat: ok"');
    expect(result.issues.some((issue) => issue.startsWith('commit-amend'))).toBe(true);
  });

  it('blocks --amend with no message at all', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit --amend --no-edit');
    expect(result.issues.some((issue) => issue.startsWith('commit-amend'))).toBe(true);
  });

  it('does NOT treat the literal text "--amend" inside a message value as the flag', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: drop --amend use" -m "Co-Authored-By: Someone <x@y.com>"',
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-amend'))).toBe(false);
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });
});

describe('commit-hook: forbidden message-source flags', () => {
  it.each(['git commit -F msg.txt', 'git commit --file=msg.txt', 'git commit -t tmpl.txt'])(
    'blocks %s',
    async (command) => {
      const { validateCommitMessage } = await hook();
      const result = await validateCommitMessage(command);
      expect(result.issues.some((issue) => issue.startsWith('commit-message-source'))).toBe(true);
    },
  );
});

describe('commit-hook: every accepted -m/--message shape is read and validated', () => {
  it('reads a combined short-flag form (-am)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -am "bad subject"');
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('reads an attached, no-space -m value (-m"bad subject")', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -m"bad subject"');
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('blocks an unknown abbreviation of --message (--mess)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit --mess "x"');
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-no-message'))).toBe(true);
  });

  it('reads --message="$(cat <<\'EOF\' …)" (inline equals-form heredoc)', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit --message="$(cat <<'EOF'\nfeat: ok\nEOF\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.message).toBe('feat: ok');
    expect(result.issues).toEqual([]);
  });

  it('blocks --message="$(cat <<\'EOF\' …)" when the body is a bad subject', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit --message="$(cat <<'EOF'\nbad subject\nEOF\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });
});

describe('commit-hook: readable vs unreadable message values', () => {
  it('allows and validates a single-quoted value containing a backtick', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git commit -m 'bad subject' -m 'see `x`'");
    expect(result).not.toBeNull();
    // Not flagged as unreadable — it legitimately fails on subject format instead.
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(
      false,
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('blocks a double-quoted value containing a backtick', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -m "see `x`"');
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  it("blocks an unquoted heredoc delimiter (<<EOF instead of <<'EOF')", async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit -m "$(cat <<EOF\nfeat: ok\nEOF\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });

  it('blocks a bare $(...) substitution outside the accepted heredoc form', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -m "$(echo bad subject)"');
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(true);
  });
});

describe('commit-hook: --trailer attribution', () => {
  it('blocks a Co-authored-by trailer (colon form)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: ok" --trailer "Co-authored-by: X <x@y>"',
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  // Advisor review round: git's --trailer accepts `token=value` as well as
  // `token: value`; a colon-only regex missed this form entirely.
  it('blocks a Co-authored-by trailer (= form)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: ok" --trailer "Co-authored-by=X <x@y>"',
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  // A --trailer value built from an unresolved substitution is just as
  // unreadable as a -m value built the same way.
  it('blocks a --trailer value containing an unresolved substitution', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: ok" --trailer "$(echo Co-authored-by: X)"',
    );
    expect(isBlocked(result)).toBe(true);
  });
});

describe('commit-hook: unrecognized post-commit options are never silently ignored', () => {
  // Advisor review round: --mess was only caught via "no message flag found
  // at all" — present alongside any OTHER -m, it slipped through unread.
  it('blocks --mess even when a valid -m is also present', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'git commit -m "feat: ok" --mess "Co-Authored-By: X"',
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-unknown-option'))).toBe(true);
  });

  // `-Fm` is `-F` (file) with value "m" — CLUSTERED_MESSAGE_FLAG's old
  // `/^-[A-Za-z]*m$/` wrongly read the whole cluster as a message flag.
  it('blocks -Fm as a forbidden message source, not a message flag', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -Fm "feat: ok"');
    expect(result.issues.some((issue) => issue.startsWith('commit-message-source'))).toBe(true);
  });

  it('blocks --fixup= (the real subject becomes "fixup! …", not the -m text)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit --fixup=HEAD -m "feat: ok"');
    expect(isBlocked(result)).toBe(true);
  });

  it('blocks -e/--edit (the editor can rewrite the message)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -e -m "feat: ok"');
    expect(isBlocked(result)).toBe(true);
  });

  it('blocks --reedit-message/-c and --reuse-message/-C (message sourced from another commit)', async () => {
    const { validateCommitMessage } = await hook();
    const a = await validateCommitMessage('git commit -c HEAD~1 -m "feat: ok"');
    const b = await validateCommitMessage('git commit -C HEAD~1');
    expect(isBlocked(a)).toBe(true);
    expect(isBlocked(b)).toBe(true);
  });

  it('still allows plain harmless flags alongside a good message', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -a -s -q --allow-empty -m "feat: ok"');
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: ANSI-C quoting and a forged nested heredoc are unreadable', () => {
  // $'...' is ANSI-C quoting: bash expands \n to a real newline inside it.
  // The vendored shell scanner deliberately does not simulate that
  // expansion (it keeps the two literal characters `\` and `n`), so reading
  // word.value directly here would validate a one-line subject while the
  // real git commit receives a multi-line message with a trailer on its own
  // line. Must block rather than validate the wrong text.
  it("blocks a $'...' (ANSI-C quoted) -m value", async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git commit -m $'feat: ok\\n\\nCo-Authored-By: X'");
    expect(isBlocked(result)).toBe(true);
  });

  // A forged heredoc whose body contains an EARLIER line matching the
  // delimiter: a real shell closes the heredoc there, and everything after
  // is further shell commands whose stdout (not literal text) becomes part
  // of the real message. The lazy regex capture must not be trusted here.
  it('blocks a forged heredoc with an earlier delimiter line inside the nominal body', async () => {
    const { validateCommitMessage } = await hook();
    const command =
      "git commit -m \"$(cat <<'EOF'\nfeat: ok\nEOF\necho Co-Authored-By: X; cat <<'EOF'\nEOF\n)\"";
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });
});

describe('commit-hook: heredoc plus an extra -m carrying attribution, both orders', () => {
  it('catches attribution in an extra -m AFTER the heredoc', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit -m "$(cat <<'EOF'\nfeat: ok\nEOF\n)" -m "Co-Authored-By: Claude <x@y>"`;
    const result = await validateCommitMessage(command);
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });

  it('catches attribution in an extra -m BEFORE the heredoc', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit -m "Co-Authored-By: Claude <x@y>" -m "$(cat <<'EOF'\nfeat: ok\nEOF\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.issues.some((issue) => issue.startsWith('commit-attribution'))).toBe(true);
  });
});

describe('commit-hook: the canonical quoted heredoc with a good message', () => {
  it('passes with LF line endings', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit -m "$(cat <<'EOF'\nfeat: add the thing\nEOF\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.message).toBe('feat: add the thing');
    expect(result.issues).toEqual([]);
  });

  it('passes with CRLF line endings', async () => {
    const { validateCommitMessage } = await hook();
    const command = `git commit -m "$(cat <<'EOF'\r\nfeat: add the thing\r\nEOF\r\n)"`;
    const result = await validateCommitMessage(command);
    expect(result.issues).toEqual([]);
  });
});

// Advisor review round: the previous version of this test only asserted
// `typeof result.exitCode === 'number'`, which passes for either 0 or 2 — it
// never actually proved the exit-0 cases the coordinator listed exit 0.
// Spawning the real hook against a freshly `git init`'d, empty temp
// directory makes `getStagedFiles()` deterministically return nothing, so
// these can assert the real exit code without depending on (or disturbing)
// this worktree's actual staged state.
describe('commit-hook: evaluate() really exits 0 for the required cases (isolated empty git repo)', () => {
  const preBashCommitQualityScriptPath = path.join(hooksDir, 'pre-bash-commit-quality.cjs');

  function runInEmptyGitRepo(command) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-hook-test-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: tempRoot });
      return spawnSync(process.execPath, [preBashCommitQualityScriptPath], {
        cwd: tempRoot,
        input: JSON.stringify({ tool_input: { command } }),
        encoding: 'utf8',
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  it("exits 0 for GIT_AUTHOR_NAME=x git commit -m 'feat: ok'", () => {
    const result = runInEmptyGitRepo("GIT_AUTHOR_NAME=x git commit -m 'feat: ok'");
    expect(result.status).toBe(0);
  });

  it('exits 0 for the canonical quoted heredoc with LF line endings', () => {
    const command = `git commit -m "$(cat <<'EOF'\nfeat: add the thing\nEOF\n)"`;
    const result = runInEmptyGitRepo(command);
    expect(result.status).toBe(0);
  });

  it('exits 0 for the canonical quoted heredoc with CRLF line endings', () => {
    const command = `git commit -m "$(cat <<'EOF'\r\nfeat: add the thing\r\nEOF\r\n)"`;
    const result = runInEmptyGitRepo(command);
    expect(result.status).toBe(0);
  });

  it('exits 0 for a non-git command that merely quotes "git commit"', () => {
    const result = runInEmptyGitRepo('grep -m 1 "git commit" CLAUDE.md');
    expect(result.status).toBe(0);
  });
});

describe('commit-hook: 15-commit regression (pinned snapshot of real main messages)', () => {
  // A SNAPSHOT, not a live `git log`. A live query here would break CI: the
  // "verify" job's actions/checkout has no fetch-depth override (default
  // shallow, single-commit), so `git log -15 main` and `git log ... c09b31e`
  // would both fail outside a full checkout — and `main` itself keeps
  // advancing as other agents land work in parallel. These are 15 real
  // commit messages captured from `main` at fix-round-1 time (`git log -15
  // --format=%B main`), plus the known-bad `c09b31e` subject, frozen here so
  // the regression check is deterministic. This still exercises the real
  // `validateCommitMessage` path end to end — only the commit-message
  // *source* is a fixture, not the check itself.
  const RECENT_MAIN_COMMITS = [
    {
      sha: '8d9f8ae',
      message:
        'fix(ci): generate Next route types before admin typecheck\n\n' +
        '.next/types is gitignored, so a fresh checkout fails tsc --noEmit\n' +
        'until next typegen has run. Also raise the eslint-rules test timeout\n' +
        'to absorb cold ESLint plugin resolution under CPU load.',
    },
    { sha: 'b7e34ec', message: 'docs: hand off Plan 1c mid-Wave 1 (W1-4 open)' },
    { sha: '7888ceb', message: 'fix(ai): pin tester outputs and per-layer quarantine' },
    { sha: 'ece4c16', message: 'docs: label tooling tests as vitest layer in testing.md' },
    {
      sha: 'c9b3aee',
      message: 'fix(ai): align test-agent proposal contract and testing.md layers',
    },
    {
      sha: '55052a8',
      message: 'feat(ai): add functional-tester, edge-case-hunter and test-automator',
    },
    { sha: '06d8c0d', message: 'fix(ai): guard implementer reset and pin gate-checker formats' },
    {
      sha: 'f6fd646',
      message: 'fix(ai): order gate-checker status first and keep facts on blocked',
    },
    { sha: '4aa2cfd', message: 'feat(ai): add implementer, gate-checker, build-error-resolver' },
    { sha: 'ca8f97d', message: 'fix(ai): tighten verifier and consistency-reviewer contracts' },
    { sha: '06900f1', message: 'feat(ai): add finding-verifier and consistency-reviewer' },
    { sha: '7caf31d', message: 'docs: record Plan 1c Wave 0 run ledger and W2-1 residuals' },
    {
      sha: 'a1602d1',
      message: 'docs(plan): align W0-6 dedupe test note and dir-token guard',
    },
    {
      sha: '321162d',
      message:
        'fix(ai): reject plan dir tokens that widen files to the whole repo\n\n' +
        './, **/, globbed, absolute and ../ directory tokens no longer become\n' +
        'dir/** entries that would match every changed file.',
    },
    {
      sha: 'e69dbc9',
      message:
        'docs(plan): record Wave 0 fix-wave interfaces and carry-forwards\n\n' +
        'W0-6 interface text matches the code (dedupe key, checkDrift reasons and\n' +
        'signature, wrapUntrusted, frozen schemas, dir tokens). W1-1, W2-1 and W5-1\n' +
        'carry the gate facts, inferred test command, schema spike and CI\n' +
        'hardening. status.md gets the Wave 0 done entry.',
    },
  ];
  const KNOWN_BAD_SUBJECT = {
    sha: 'c09b31e',
    subject: 'chore(ai): trim review rule, add deny baseline and no-attribution settings',
  };

  function heredocCommand(message) {
    return `git commit -m "$(cat <<'EOF'\n${message}\nEOF\n)"`;
  }

  it('passes all 15 pinned real commits, both as -m and heredoc', async () => {
    const { validateCommitMessage } = await hook();
    expect(RECENT_MAIN_COMMITS.length).toBe(15);

    for (const { sha, message } of RECENT_MAIN_COMMITS) {
      const subject = message.split('\n')[0];
      const plainResult = await validateCommitMessage(
        `git commit -m "${subject.replace(/"/g, '\\"')}"`,
      );
      const heredocResult = await validateCommitMessage(heredocCommand(message));
      expect(plainResult.issues, `${sha} (plain): ${JSON.stringify(plainResult.issues)}`).toEqual(
        [],
      );
      expect(
        heredocResult.issues,
        `${sha} (heredoc): ${JSON.stringify(heredocResult.issues)}`,
      ).toEqual([]);
    }
  });

  it('still fails c09b31e (known 74-char subject), confirming the check has teeth', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      `git commit -m "${KNOWN_BAD_SUBJECT.subject.replace(/"/g, '\\"')}"`,
    );
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });
});

// Fix round 3: rounds 1 and 2 kept closing one denylisted expansion/wrapper
// shape only to have the re-review find another of the same kind. Round 3
// flips the model: every commit segment is allowlisted by literalness, not
// denylisted by shape. See task-W1-4-fix3-findings.md, rules 1-5, plus two
// corrections to round 2's own work.
describe('commit-hook: fix round 3, Rule 1 - every word must be literal, positionals included', () => {
  it.each([
    [
      "brace-expansion injecting -m/'Co-authored-by'",
      "git commit -m 'feat: ok' {-m,'Co-authored-by: Claude <x@y>'}",
    ],
    [
      "brace-expansion injecting --trailer/'Co-authored-by'",
      "git commit -m 'feat: ok' {--trailer,'Co-authored-by: Claude <x@y>'}",
    ],
    ['a bare $EXTRA positional', "git commit -m 'feat: ok' $EXTRA"],
    [
      'a bare $(...) building a --trailer flag',
      "git commit -m 'feat: ok' $(printf -- '--trailer=Co-%s' 'authored-by: X')",
    ],
    ['a bare $(...) building --amend', "git commit -m 'feat: ok' $(echo --amend)"],
  ])('blocks %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });

  it('still allows an ordinary literal pathspec positional', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('git commit -m "feat: ok" src/file.ts');
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: fix round 3, correction 1 - double quotes do not glob/brace/tilde-expand', () => {
  it.each([
    ['a literal ? in a double-quoted subject', 'git commit -m "fix: why does it fail?"'],
    ['literal [ ] in a double-quoted subject', 'git commit -m "fix(engine): handle [edge] case"'],
  ])('does not flag %s as unreadable', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(result.issues.some((issue) => issue.startsWith('commit-message-unreadable'))).toBe(
      false,
    );
  });
});

describe('commit-hook: fix round 3, Rule 2 - assignment prefixes', () => {
  it('detects and validates a commit behind a QUOTED assignment value (regression vs. 702cb8f)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('GIT_AUTHOR_NAME="A B" git commit -m "bad subject"');
    expect(result).not.toBeNull();
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('blocks a DYNAMIC assignment value', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage('X=$(echo foo) git commit -m "feat: ok"');
    expect(isBlocked(result)).toBe(true);
  });

  it('blocks a GIT_CONFIG_* prefix set via an earlier export in the same command text', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=trailer.co.key GIT_CONFIG_VALUE_0=Co-authored-by; ' +
        "git commit -m 'feat: ok' --trailer 'co: Claude <x@y>'",
    );
    expect(isBlocked(result)).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith('commit-unsafe-config'))).toBe(true);
  });

  it('still allows a plain, literal GIT_AUTHOR_NAME=x prefix (regression guard)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("GIT_AUTHOR_NAME=x git commit -m 'feat: ok'");
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: fix round 3, Rule 3 - -c/--config-env generalized beyond trailer.*.key', () => {
  it.each([
    ['include.path', "git -c include.path=/tmp/evil commit -m 'feat: ok'"],
    ['includeIf.onbranch.path', "git -c includeIf.onbranch.path=/tmp/evil commit -m 'feat: ok'"],
    ['alias.*', "git -c alias.foo=bar commit -m 'feat: ok'"],
  ])('blocks a sensitive -c key: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });

  it('blocks a -c value that is dynamic, even for an otherwise-ordinary key', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git -c user.name=$(whoami) commit -m 'feat: ok'");
    expect(isBlocked(result)).toBe(true);
  });

  it('still allows a plain, literal, non-sensitive -c user.name=x (regression guard)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage("git -c user.name=x commit -m 'feat: ok'");
    expect(result.issues).toEqual([]);
  });
});

describe('commit-hook: fix round 3, Rule 4 - shell wrappers recurse only when unambiguously literal', () => {
  it.each([
    ['-o pipefail (an unmodeled option)', `bash -o pipefail -c 'git commit -m "bad subject"'`],
    ['a bare -- during option parsing', `bash -c -- 'git commit -m "bad subject"'`],
    ['a quoted "-c" flag word', `bash "-c" 'git commit -m "bad subject"'`],
    ['piped stdin instead of -c', `echo 'git commit -m "bad subject"' | bash`],
  ])('blocks an unrecognized shell shape that mentions commit: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });

  it('blocks a heredoc fed to a shell (stdin, not -c) that mentions commit', async () => {
    const { validateCommitMessage } = await hook();
    const command = 'bash <<\'EOF\'\ngit commit -m "bad subject"\nEOF';
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });

  it('still recurses into an ordinary literal bash -c argument (regression guard)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(`bash -c 'git commit -m "bad subject"'`);
    expect(result.issues.some((issue) => issue.startsWith('commit-format'))).toBe(true);
  });

  it('does NOT block an unrecognized shell shape with no "commit" anywhere (must not regress)', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(`bash -o pipefail -c 'echo hello'`);
    expect(result).toBeNull();
  });
});

describe('commit-hook: fix round 3, Rule 5 - other wrappers and dynamic command words', () => {
  it.each([
    ['sudo', 'sudo git commit -m "bad subject"'],
    ['eval', `eval 'git commit -m "bad subject"'`],
    ['a dynamic command word', '$(echo git) commit -m "bad subject"'],
    ['env -S (opaque re-tokenization, not transparent)', `env -S 'git commit -m "bad subject"'`],
  ])('blocks a wrapper that mentions commit: %s', async (_label, command) => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(command);
    expect(isBlocked(result)).toBe(true);
  });

  it('does not regress: a non-git, non-shell, non-wrapper command is not a candidate at all', async () => {
    const { validateCommitMessage } = await hook();
    const results = await Promise.all([
      validateCommitMessage('grep -m 1 "git commit" CLAUDE.md'),
      validateCommitMessage(`cat >> foo <<'EOF'\nsome content\nEOF`),
      validateCommitMessage('time pnpm verify'),
      validateCommitMessage('env NODE_ENV=test node script.js'),
    ]);
    for (const result of results) expect(result).toBeNull();
  });
});

describe('commit-hook: fix round 3, pre-merge smoke test (false-positive guard)', () => {
  it('passes a realistic cd && git add && git commit chain', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "cd /repo && git add -A && git commit -m 'feat: add the thing'",
    );
    expect(result.issues).toEqual([]);
  });

  it('passes a subject containing ?, [ ], and ( ) as literal characters', async () => {
    const { validateCommitMessage } = await hook();
    const result = await validateCommitMessage(
      "git commit -m 'fix: handle [edge] case (round 3)?'",
    );
    expect(result.issues).toEqual([]);
  });
});
