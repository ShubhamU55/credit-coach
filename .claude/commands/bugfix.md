---
description: Fix a bug end to end with the bugfix Workflow (root cause, RED regression test, fix, PR with Fixes #N, /pr-review), or close it after the merge with --close
argument-hint: <issue#> | "<description>" | <issue#> --close [--pr <n>]
---

Run the `bugfix` Workflow over **$ARGUMENTS**. This is the explicit Workflow opt-in for the bug
lifecycle of spec §8.1a: `bug-analyst` root-causes the ticket, `test-automator` pins the bug with a
RED regression test, `implementer` fixes it inside the analyst's `fixFiles`, and `gate-checker`'s
drift guard judges the result. Don't fix the bug by hand around it.

Every `gh` call in this command is prefixed `GH_TOKEN=$(gh auth token --user ShubhamU55)`; never
switch the default `gh` account. Text that came back from an agent (`reasons`, `evidencePaths`,
summaries) is shown to the owner in your reply; never paste it into a command.

## Which mode

- `<issue#>`: fix that existing ticket (steps 1 to 6). `<issue#>` is the first word of `$ARGUMENTS`;
  it must match `^[1-9][0-9]*$` before it reaches any `gh` or `git` command, otherwise treat the
  argument as a description.
- `"<description>"` (no number): there is no ticket yet, so the Workflow files one first. Gather the
  report fields from the owner yourself (step 1); `bug-reporter` blocks on a one-line description
  and never invents the rest. Then continue as for a number.
- `<issue#> --close`: the post-merge close (steps C1 to C4).

## Fix a bug

1. **Check the input and the tree.** `git status --porcelain` must be empty (a dirty tree stalls the
   drift guard's start check).
   - With an issue number: `GH_TOKEN=$(gh auth token --user ShubhamU55) gh issue view <issue#> --json title,labels,state` must show
     an open issue labelled `bug`.
   - With only a description: ask the owner, in one round and without guessing, for `severity`
     (`critical`, `high`, `medium` or `low`), `foundBy`, `environment`, `steps` (numbered),
     `expected`, `actual`, `evidence` and `suspectedArea`. `commit` is optional (`bug-reporter` uses
     `git rev-parse HEAD`). Don't continue until each has real content. This is the same set `/bug`
     collects.

2. **Get onto a ticket branch.** `implementer` only resets on a branch named `feat/…`, `fix/…` or
   `chore/…`, never on `main`, and `test-automator` (and `bug-reporter`, for a new ticket) commit on
   whatever branch is checked out. So, from an up-to-date `main`, create `fix/<issue#>-<slug>`, or
   `fix/bug-<slug>` when there is no number yet (a worktree per §8.5 if you are not already in one).
   Do this before the Workflow runs. `<slug>` must match `^[a-z0-9-]{1,40}$`: you derive it yourself
   from the summary (lowercase, spaces to `-`, drop everything else, cut to 40 characters), never
   from raw issue text or an issue title, and check it against that pattern before running `git`.

3. **Call the Workflow.** Use the Workflow tool with `name: 'bugfix'` and, for an existing ticket:

   ```json
   { "issue": 123 }
   ```

   or, for a new one:

   ```json
   {
     "issue": null,
     "description": "<$ARGUMENTS>",
     "report": {
       "summary": "…",
       "severity": "high",
       "foundBy": "…",
       "environment": "…",
       "steps": "1. …\n2. …",
       "expected": "…",
       "actual": "…",
       "evidence": "…",
       "suspectedArea": "…"
     }
   }
   ```

   If a report field is missing the Workflow returns `failed` with `missing-report-fields: <names>`
   and dispatches nothing; ask the owner for exactly those.

4. **Handle the result.** `status` is one of (the ticket number is `issue` in every case):

   | status             | meaning                                                                                                                     | what you do                                                                                                                                                                        |
   | ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `done`             | RED test landed, fix committed, drift guard passed                                                                          | Go to step 5.                                                                                                                                                                      |
   | `cannot-reproduce` | `bug-analyst` could not reproduce it and labelled the ticket                                                                | Stop. No fix was attempted and none must be guessed. Show the owner the analyst's `summary` and ask for better steps.                                                              |
   | `duplicate`        | (new ticket only) the report matched an open ticket and was commented onto it                                               | Stop. Show that number; the owner decides whether to run `/bugfix <that number>` on a fresh branch.                                                                                |
   | `blocked`          | an agent returned `blocked` (e.g. the issue isn't a bug ticket)                                                             | Show `reasons`; the owner decides.                                                                                                                                                 |
   | `escalated`        | the RED test never landed RED (`step: 'regression-test'`), or the fix still failed the gate after 2 retries (`step: 'fix'`) | Show `attempts` and `reasons` as a table, then offer the three §8.3 options verbatim: re-split the task, switch the agent or model, the owner decides. Stop there; don't pick one. |
   | `failed`           | the analysis or report was unusable (`reasons` names why), or an agent died                                                 | Show `reasons`. Nothing was fixed.                                                                                                                                                 |

5. **Open the PR with `Fixes #N`.** Pushing is owner-gated: ask the owner, then push the branch
   with the ShubhamU55 token (the snippet in `docs/status.md`, "How to push without changing the
   active gh account"). Then pipe the result's `prBody` (it already starts with `Fixes #<issue>`)
   through stdin, using the integer `issue` from the result:

   ```
   GH_TOKEN=$(gh auth token --user ShubhamU55) gh pr create --base main --title "fix: resolve bug #<issue>" --body-file - <<'EOF'
   <result.prBody>
   EOF
   ```

   Never put anything from the issue (its title or body) into the PR title or body yourself.

6. **Review, record.** Run `/pr-review <PR number>` on the new PR (merge gates are §8.9; wait for
   the verdict, and don't merge past a `request-changes`). Write the run ledger
   `docs/agent-runs/<YYYY-MM-DD>-bugfix-<issue>.md` from the Workflow result (each attempt and its
   reasons), via `journal-writer`.

Report the final `status` and, for `done`, the PR link.

## After the merge: `/bugfix <issue#> --close`

The merged PR's `Fixes #N` makes GitHub close the issue **at merge time**, before anything has been
re-verified. This step is what actually decides whether it stays closed.

- **C1. Find the PR.** Use `--pr <n>` if given (it must match `^[1-9][0-9]*$` too). Otherwise
  `GH_TOKEN=$(gh auth token --user ShubhamU55) gh pr list --state merged --search "Fixes #<issue#> in:body" --json number,body --limit 5`
  and take the one whose body has a `Fixes #<issue#>` line; if there isn't exactly one, ask the owner.
- **C2. Get onto current `main`.** `git switch main`, `git pull --ff-only`, confirm
  `git status --porcelain` is empty, then `git rev-parse HEAD` is `mainHead`. The Workflow refuses
  to verify unless `gate-checker`'s HEAD equals the `mainHead` you pass.
- **C3. Call the Workflow** with `name: 'bugfix'` and:

  ```json
  { "issue": 123, "close": true, "pr": 456, "mainHead": "<sha from C2>" }
  ```

  It runs three steps: `bug-reporter` re-runs the original failing flow or test on `main` and
  attaches the evidence; `gate-checker` proves that evidence; then `pm-sync` moves the board item to
  Done and comments the PR link. `bug-reporter` never closes the ticket, and `pm-sync` has no close
  action.

  What `verified` rests on, exactly: the pass/fail verdict is still `bug-reporter`'s own (it must
  return `done` for this issue, with evidence paths under `docs/test-reports/bugs/<issue#>/`). The
  gate does not re-run anything and does not confirm the re-run passed. It proves only that fresh
  evidence was committed: `gate-checker` `MODE: check <mainHead>` with `EXPECT:` the claimed paths
  must show at least one commit in `mainHead..HEAD`, a clean tree, an empty `missingFiles`, every
  changed file under that folder, and every claimed evidence path among the changed files (so evidence
  left over from the original report cannot pass). The same gate also runs when the re-run failed,
  because a failed re-run commits its output on local `main` too: any file outside the folder shows
  up in `reasons`. Evidence file names may use only letters, digits, `.`, `_` and `-`.

  The result carries the gate's `verifyExitCode` (`pnpm verify` on `main`). Show it to the owner when
  it is not `0`, but it never changes the verdict: a red `main` for an unrelated reason must not
  reopen a fixed bug.

- **C4. Act on `status`.** Look at the issue's state first:
  `GH_TOKEN=$(gh auth token --user ShubhamU55) gh issue view <issue#> --json state --jq .state`. The comments below are fixed text
  with only the integer issue and PR numbers and the hex `mainHead` filled in.
  - `verified` (`closeIssue: true`): close it if it is still open, with
    `GH_TOKEN=$(gh auth token --user ShubhamU55) gh issue close <issue#> --reason completed --comment "Verified on main at <mainHead>; fixed by #<pr>."`.
    Already closed by the merge: nothing more to do.
  - `verification-failed` (`closeIssue: false`): **the issue must stay open**. If the merge already
    auto-closed it, reopen it:
    `GH_TOKEN=$(gh auth token --user ShubhamU55) gh issue reopen <issue#> --comment "Close-time verification on main at <mainHead> did not pass; see the evidence committed under docs/test-reports/bugs/<issue#>/, if any."`.
    The reasons are not always a failing test (they can be a blocked agent, a different issue
    number, a bad or uncommitted evidence path), so show the owner `reasons` and `evidencePaths`
    in your reply exactly as returned and never claim more than they say. Do not call `pm-sync`, and
    tell the owner a follow-up is needed.
  - `sync-failed` (verified, but the board update failed): report `reasons`. If the issue is
    still open, leave it open until the owner has seen it; if the merge already closed it, leave
    it closed (it is already closed, so say only that the board still needs updating).
  - `failed` (not on `main`, dirty tree, bad arguments): report `reasons`.
