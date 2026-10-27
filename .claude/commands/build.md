---
description: 'Drive an approved plan task by task with the feature-build Workflow (implementer -> gate-checker -> retry/escalate -> review -> qa). Use when a plan is approved and ready to build.'
argument-hint: '<plan path> [task ids...] [--dry-run drift,tests]'
disable-model-invocation: true
allowed-tools: 'Bash(node .claude/hooks/bin/plan-tasks.mjs *)'
---

Run the `feature-build` Workflow over **$ARGUMENTS**. This is the explicit Workflow opt-in for
driving an already-approved plan (`docs/superpowers/plans/*.md`) through the full build loop —
don't skip to writing code by hand.

1. **Parse the arguments.** The first token is the plan path. Any further bare tokens are task
   ids to run (omit to run every task in the plan). A trailing `--dry-run drift,tests` becomes
   `args.dryRun.faults: ['drift', 'tests']` (whichever of the two comma-separated fault names are
   given) — it exists only to prove the drift guard and retry/escalate loop actually catch a real
   fault, and it applies to the **first** task's attempts only.

2. **Parse the plan's tasks.** Run:

   ```
   node .claude/hooks/bin/plan-tasks.mjs <plan path> [task ids...]
   ```

   For each parsed task that has `testFiles` but no `testCommand`, infer one: find the
   `package.json` nearest to the task's test files (walking up from the first test file's
   directory) and use `pnpm --filter <name> test`, where `<name>` is that `package.json`'s own
   `name` field. Mark the inferred command in the run ledger (step 5) so it's clear it wasn't
   written in the plan itself. A task with neither `testFiles` nor a `testCommand` keeps
   `testCommand: null` — don't invent one.

3. **Call the Workflow.** Use the Workflow tool with `name: 'feature-build'` and:

   ```json
   {
     "planPath": "<plan path>",
     "specPaths": ["docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md"],
     "tasks": [/* the parsed (and test-command-inferred) tasks, in plan order */],
     "dryRun": { "faults": ["drift", "tests"] }
   }
   ```

   (omit `dryRun` entirely when `--dry-run` wasn't given).

4. **Bug tickets for out-of-scope findings.** For each entry in the result's `outOfScope[]`: if
   the `bug-reporter` agent exists (`.claude/agents/bug-reporter.md`, landing in W3-3), use it to
   file one bug ticket per finding, linking the plan/task it surfaced from. Until `bug-reporter`
   exists, just list each out-of-scope finding in the run ledger (step 5) instead — don't invent a
   ticket by hand.

5. **Write the run ledger.** Create `docs/agent-runs/<YYYY-MM-DD>-<slug>.md` (today's date, a slug
   from the plan name) from the workflow's result: every agent call and model tier, each task's
   attempts and their failure reasons, the gate-checker facts that blocked or passed each attempt,
   confirmed and refuted findings (and any out-of-scope ones per step 4), the `qa` phase's counts
   and `failedTesters`, the post-QA fix pass's own result (`result.qaFix`: `null` when QA found
   nothing confirmed and landed no failing proposal, otherwise `{ ok, reasons, findings }` — render
   `reasons` even when `ok` is `true`, since a `qaFix.ok === false` is the only visible sign that a
   confirmed QA finding or a newly landed red test is still unfixed), and the `stats` object
   (`agents`, `retries`, `escalations`, `tokens`). This is the main session's job until
   `journal-writer` exists — don't skip it even for a clean run.

6. **Render any escalation.** For every task in the result with `status: 'escalated'`, show the
   owner a table of its attempts and reasons, then present the three §8.3 options verbatim:
   - re-split the task
   - switch the agent or model
   - the owner decides

   Stop there for that task; don't guess which option to take. If `result.qaFix` is present and
   `ok: false`, render it the same way: its `findings` (what's still unfixed) and `reasons` (why
   the fix pass failed), then the same three §8.3 options — a QA-phase escalation needs the same
   visibility as a task escalation, not just a bump in `stats.escalations`.

Report the final `status` (`done` | `partial` | `escalated`) and a one-line summary of what
landed. Commit messages inside the loop are made by `implementer`/`build-error-resolver`
themselves, per their own briefs — never rewrite or re-commit on their behalf.
