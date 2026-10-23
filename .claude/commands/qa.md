---
description: Run the qa Workflow over a scope (changed paths picked by the §8.1 table, deduped findings verified adversarially)
argument-hint: <scope description>
---

Run the `qa` Workflow over **$ARGUMENTS** (a short description of what's being tested — a task
id, a PRD section, or free text; it's passed straight through as `args.scope` and never parsed).

1. **Compute the diff.** Run:

   ```
   git merge-base main HEAD
   git rev-parse HEAD
   git diff --name-only <base>..HEAD
   git diff <base>..HEAD
   ```

   to get `base`, `head`, `changedFiles` and the raw `diff` text yourself, exactly as
   `gate-checker`'s `MODE: diff` would. Pass all four through to the Workflow in step 3 — every
   tester's own brief needs `base`/`head` as much as `changedFiles`/`diff` does; omitting them is
   not a shortcut, it silently leaves every tester prompt saying "not supplied" (fix round 1,
   finding A). (The `qa` Workflow also falls back to calling `gate-checker` itself with
   `MODE: diff` for whichever of the four you don't supply — computing them here just avoids a
   redundant call when you already have a working tree to diff.)

2. **Acceptance criteria.** If this scope has them (from `requirements-analyst`'s output for the
   ticket, or the plan task's own interfaces/acceptance criteria), pass them as `args.criteria`.
   Running `/qa` with no criteria is valid but means `functional-tester` is skipped for this run
   (it requires criteria by its own Stop rules) — say so in the summary rather than treating it as
   a silent gap.

3. **Call the Workflow.** Use the Workflow tool with `name: 'qa'` and:

   ```json
   {
     "scope": "$ARGUMENTS",
     "base": "<from step 1>",
     "head": "<from step 1>",
     "changedFiles": ["<from step 1>"],
     "diff": "<from step 1>",
     "criteria": ["<from step 2, if any>"]
   }
   ```

4. **Report the result.** Show: the testers that ran and the testers in `failedTesters` (and why,
   if known — e.g. "not built yet" for `ui-tester`/`integration-tester`/`api-tester` before
   W3-2, or "no acceptance criteria" for `functional-tester`), the `confirmed` findings (severity,
   file, title), the `counts` object, and the test `proposals` — note that nothing is committed
   yet; proposals land only when `test-automator` runs (the `feature-build` workflow's own
   after-QA phase does this automatically; a bare `/qa` run only reports them).

Never fix a confirmed finding yourself from this command — hand it to `implementer` (in-scope) or
file it as a bug (out-of-scope), per §8.1a.
