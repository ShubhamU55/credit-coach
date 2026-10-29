---
description: 'Report stale worktrees and predicted merge conflicts between active ticket branches (read-only). Use before merging while several ticket branches are active.'
disable-model-invocation: true
argument-hint: '[--base main] [--stale-days 7] [--json]'
allowed-tools: 'Bash(node .claude/hooks/bin/worktrees.cjs) Bash(node .claude/hooks/bin/worktrees.cjs *)'
---

<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

Report on this repo's git worktrees (spec §8.5: one ticket = one branch = one worktree). This is
**read-only**: it never removes a worktree, merges, or touches a working tree or the index.

1. **Run the report** from any worktree of the repo:

   ```
   node .claude/hooks/bin/worktrees.cjs $ARGUMENTS
   ```

   Needs Git 2.38 or newer (`git merge-tree --write-tree`). Add `--json` for machine-readable
   output. Each worktree gets a state:
   - `base`: the base branch's own checkout (default `main`).
   - `merged`: no commits the base lacks; nothing left to merge.
   - `active`: has unmerged commits and was committed to within `--stale-days` (default 7).
   - `stale`: has unmerged commits but nothing committed for longer than that.
   - `detached` or `unknown`: no branch, or git facts were unavailable.

   A `DIRTY` flag marks uncommitted changes, whatever the state.

2. **Read the predicted conflicts.** For every branch that is `active` or `stale`, the report
   predicts a merge against the base and against every other such branch with
   `git merge-tree --write-tree`, and lists only the pairs that would conflict, with the
   conflicted paths. `UNKNOWN (...)` means git could not answer, which is **not** "no conflict":
   say so and show the reason. Predictions use committed tips only.

3. **Report, don't act.** Summarize: which worktrees look finished (`merged`) or abandoned
   (`stale`), and which pairs of tickets are about to collide (the sooner-merging ticket should
   land first, or the two should coordinate on the named files). Removing a worktree
   (`git worktree remove`) or branch is the owner's call; never do it from this command, and never
   remove a `DIRTY` or unmerged worktree.
