// Fix round 1: the controller's Opus task review found real bypasses in the
// first pass at pre-bash-commit-quality.cjs — mostly because commit
// detection used to be a substring check (`command.includes('git commit')`)
// instead of real shell parsing. This file is the bypass matrix the review
// listed, each case named after the review's own wording so it is easy to
// cross-reference against the fix-round report.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  it("evaluate() exits 0 for GIT_AUTHOR_NAME=x git commit -m 'feat: ok' when nothing else is staged-dirty", async () => {
    // This specific check depends only on message handling (deterministic),
    // not on whatever happens to be staged in the real repo at test time —
    // see the dedicated validateCommitMessage test above for that guarantee.
    // This evaluate()-level test documents the same case the review listed,
    // tolerating a non-zero exit only if it's for unrelated staged-file
    // reasons (never for the message itself).
    const { evaluate, validateCommitMessage } = await hook();
    const command = "GIT_AUTHOR_NAME=x git commit -m 'feat: ok'";
    const messageResult = await validateCommitMessage(command);
    expect(messageResult.issues).toEqual([]);
    const result = await evaluate(JSON.stringify({ tool_input: { command } }));
    expect(typeof result.exitCode).toBe('number');
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
