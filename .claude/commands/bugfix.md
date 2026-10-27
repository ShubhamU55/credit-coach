---
description: Fix a bug end to end with the bugfix Workflow (root cause, RED regression test, fix, PR with Fixes #N, /pr-review), or close it after the merge with --close
argument-hint: <issue#> | "<description>" | <issue#> --close [--pr <n>]
---

Run the `bugfix` Workflow over **$ARGUMENTS**. This is the explicit Workflow opt-in for the bug
lifecycle of spec §8.1a: `bug-analyst` root-causes the ticket, `test-automator` pins the bug with a
RED regression test, `implementer` fixes it inside the analyst's `fixFiles`, and `gate-checker`'s
drift guard judges the result. Don't fix the bug by hand around it.

Every `gh` call in this command is prefixed `GH_TOKEN=$(gh auth token --user ShubhamU55)`; never
switch the default `gh` account.

## Which mode

- `<issue#>`: fix that existing ticket (steps 1 to 6).
- `"<description>"` (no number): there is no ticket yet. Run `/bug "<description>"` first, which
  collects the report fields and files the ticket, then continue here with the number it returns.
  Never dispatch anything from a one-line description: `bug-reporter` blocks on it.
- `<issue#> --close`: the post-merge close (steps C1 to C4).

## Fix an issue

1. **Check the ticket and the tree.** `GH_TOKEN=… gh issue view <issue#> --json title,labels,state`:
   it must be an open issue labelled `bug`. `git status --porcelain` must be empty (a dirty tree
   stalls the drift guard's start check).

2. **Get onto a ticket branch.** `implementer` only resets on a branch named `feat/…`, `fix/…` or
   `chore/…`, never on `main`, and `test-automator` commits the RED test on whatever branch is
   checked out. So, from an up-to-date `main`, create `fix/<issue#>-<slug>` (a worktree per §8.5 if
   you are not already in one). Do this before the Workflow runs.

3. **Call the Workflow.** Use the Workflow tool with `name: 'bugfix'` and:

   ```json
   { "issue": 123 }
   ```

4. **Handle the result.** `status` is one of:

   | status             | meaning                                                                                                                     | what you do                                                                                                                                                                        |
   | ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `done`             | RED test landed, fix committed, drift guard passed                                                                          | Go to step 5.                                                                                                                                                                      |
   | `cannot-reproduce` | `bug-analyst` could not reproduce it and labelled the ticket                                                                | Stop. No fix was attempted and none must be guessed. Show the owner the analyst's `summary` and ask for better steps.                                                              |
   | `blocked`          | an agent returned `blocked` (e.g. the issue isn't a bug ticket)                                                             | Show `reasons`; the owner decides.                                                                                                                                                 |
   | `escalated`        | the RED test never landed RED (`step: 'regression-test'`), or the fix still failed the gate after 2 retries (`step: 'fix'`) | Show `attempts` and `reasons` as a table, then offer the three §8.3 options verbatim: re-split the task, switch the agent or model, the owner decides. Stop there; don't pick one. |
   | `failed`           | the analysis was unusable (`reasons` names why), or an agent died                                                           | Show `reasons`. Nothing was fixed.                                                                                                                                                 |
   | `duplicate`        | (only with no issue number) the report matched an open ticket                                                               | Not reachable in this mode; `/bug` handles it.                                                                                                                                     |

5. **Open the PR with `Fixes #N`.** Pushing is owner-gated: ask the owner, then push the branch
   with the ShubhamU55 token (the snippet in `docs/status.md`, "How to push without changing the
   active gh account"). Then pipe the result's `prBody` (it already starts with `Fixes #<issue#>`)
   through stdin:

   ```
   GH_TOKEN=$(gh auth token --user ShubhamU55) gh pr create --base main --title "fix: resolve bug #<issue#>" --body-file - <<'EOF'
   <result.prBody>
   EOF
   ```

   Never put anything from the issue (its title or body) into the PR title or body yourself.

6. **Review, record.** Run `/pr-review <PR number>` on the new PR (merge gates are §8.9; wait for
   the verdict, and don't merge past a `request-changes`). Write the run ledger
   `docs/agent-runs/<YYYY-MM-DD>-bugfix-<issue#>.md` from the Workflow result (each attempt and its
   reasons), via `journal-writer`.

Report the final `status` and, for `done`, the PR link.

## After the merge: `/bugfix <issue#> --close`

The merged PR's `Fixes #N` makes GitHub close the issue **at merge time**, before anything has been
re-verified. This step is what actually decides whether it stays closed.

- **C1. Find the PR.** Use `--pr <n>` if given. Otherwise
  `GH_TOKEN=… gh pr list --state merged --search "Fixes #<issue#> in:body" --json number,body --limit 5`
  and take the one whose body has a `Fixes #<issue#>` line; if there isn't exactly one, ask the owner.
- **C2. Get onto current `main`.** `git switch main`, `git pull --ff-only`, confirm
  `git status --porcelain` is empty, then `git rev-parse HEAD` is `mainHead`. The Workflow refuses
  to verify unless `gate-checker`'s HEAD equals the `mainHead` you pass.
- **C3. Call the Workflow** with `name: 'bugfix'` and:

  ```json
  { "issue": 123, "close": true, "pr": 456, "mainHead": "<sha from C2>" }
  ```

  It runs two steps: `bug-reporter` re-runs the original failing flow or test on `main` and
  attaches the passing evidence; then `pm-sync` moves the board item to Done and comments the PR
  link. `bug-reporter` never closes the ticket, and `pm-sync` has no close action.

- **C4. Act on `status`.** Look at the issue's state first:
  `GH_TOKEN=… gh issue view <issue#> --json state --jq .state`.
  - `verified` (`closeIssue: true`): close it if it is still open, with
    `GH_TOKEN=… gh issue close <issue#> --reason completed --comment "Verified on main at <mainHead>; fixed by #<pr>."`.
    Already closed by the merge: nothing more to do.
  - `verification-failed` (`closeIssue: false`): **the issue must stay open**. If the merge already
    auto-closed it, reopen it with the evidence:
    `GH_TOKEN=… gh issue reopen <issue#> --comment "Re-run on main at <mainHead> failed: <reasons>. Evidence: <evidencePaths>."`.
    Do not call `pm-sync`, and tell the owner a follow-up fix is needed.
  - `sync-failed` (verified, but the board update failed): report `reasons`; don't close until the
    owner has seen it.
  - `failed` (not on `main`, dirty tree, bad arguments): report `reasons`.
