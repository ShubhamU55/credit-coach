---
description: Analyze a PRD section with the feature-analyze Workflow, write a plan, stop for owner approval, then file one issue per task and hand off to /build
argument-hint: <PRD section, e.g. §5.3>
---

Run the `feature-analyze` Workflow over **PRD $ARGUMENTS**, then turn its brief into an approved
plan. This is the explicit Workflow opt-in for the analysis phase of the
`/feature` → `/build` → `/qa` → `/pr-review` pipeline. This command plans; it does not build.
Do the steps in order and don't skip any.

1. **Run `feature-analyze`.** Load the `credit-domain` skill. Decide `isUi`: `true` when the PRD
   section describes a user-facing screen or interaction (then also read the relevant parts of
   `docs/design.md`), `false` otherwise. Use the Workflow tool with `name: 'feature-analyze'` and:

   ```json
   { "prdSection": "$ARGUMENTS", "isUi": true }
   ```

   `prdSection` is the section id or heading only, never the section's text: the agents read
   `docs/PRD.md` themselves. The result is an analysis brief:
   `{ status, criteria, invariants, risks, kitComponents, openQuestions, outOfScope, failedAgents, analystSummary }`.

   - `status: 'failed'`: the criteria are mandatory. **Stop here**: tell the owner which agent in
     `failedAgents` failed, show any `risks`, and do not write a plan from a failed brief.
   - `status: 'empty'`: `requirements-analyst` succeeded but found no behaviour to specify in this
     section (for example a purely introductory one). **This is not an agent failure.** Stop here:
     tell the owner "nothing to specify in `$ARGUMENTS`", quote `analystSummary`, and show the
     `openQuestions` and `outOfScope` it returned (and name any `failedAgents`, which can still be
     set). Ask which section to analyze instead; do not write a plan.
   - `status: 'degraded'`: the brief is usable but a checker did not run. Name every entry of
     `failedAgents` in your summary to the owner and say which checks (domain facts F1–F7 or
     design) were not done, before planning on it.
   - `status: 'done'`: continue. (`design-checker` is not dispatched when `isUi` is `false`; that is
     a skip, not a failure.)

2. **Plan.** Use superpowers `writing-plans` to write the plan in `docs/superpowers/plans/` from
   the brief: carry `criteria` and `invariants` into the task acceptance tests, put every
   `risks` entry (domain and design findings) where a task must handle it, name the `kitComponents`
   for UI tasks, and keep `outOfScope` out of the tasks. List each `openQuestions` entry in the
   plan for the owner to answer; don't guess answers. If a plan already covers this section,
   continue from its ledger instead of writing a second one.

3. **Optional second opinion.** For a large or risky plan, dispatch the `planner` agent over the
   written plan and fold in what you accept.

4. **Stop for owner approval.** Present the plan, the brief's `status`, the `failedAgents`, the
   open questions and the risks, and **wait for the owner to approve**. Do not file issues or start
   building before that.

5. **File the issues.** On approval, dispatch `pm-sync` with `create-issue` once per plan task
   (title and body from the task text). If `pm-sync` blocks (for example the owner's `gh` token
   lacks the `project` scope, or the project board doesn't exist yet), **do not file issues by
   hand and don't retry around the block**. Instead list the tasks that would have been filed in
   the plan's ledger, mark them "not filed (pm-sync blocked: <reason>)", and tell the owner what is
   needed (the scope or the board).

6. **Hand off.** Tell the owner to run `/build <plan path>` to build the approved plan.

Commit messages are conventional commits with no AI attribution lines. Never fix a risk or answer
an open question yourself from this command: the plan records them for the owner to decide.
