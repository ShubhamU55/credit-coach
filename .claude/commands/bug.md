---
description: "File a bug ticket from the owner's report (collects the template fields, then runs the bugfix Workflow's report phase). Use when the owner reports a defect and wants a ticket, not a fix."
argument-hint: '<description>'
disable-model-invocation: true
allowed-tools: 'Bash(git rev-parse HEAD) Bash(git ls-files docs/test-reports/bugs/*)'
---

File a GitHub bug ticket for **$ARGUMENTS** with the `bugfix` Workflow's report phase
(`reportOnly`), so `bug-reporter` does the dedupe, labelling and evidence commit from
`.github/ISSUE_TEMPLATE/bug.yml`. This command only reports; it never fixes (that is `/bugfix`).

Never put `$ARGUMENTS` (or any other text the owner typed) into a shell command: it is data for
the report only.

A one-line description is **not enough**: `bug-reporter` blocks on it and never invents narrative
content, so gathering the fields is this command's job. Every `gh` call is prefixed
`GH_TOKEN=$(gh auth token --user ShubhamU55)`; never switch the default `gh` account.

1. **Seed the summary** from `$ARGUMENTS`. If it is empty, ask the owner for one or two sentences.

2. **Collect the missing fields from the owner**, in one round of questions, never guessing:
   - `severity`: `critical`, `high`, `medium` or `low`
   - `foundBy`: who found it (the owner's name, or the tester or CI job)
   - `environment`: emulator or device, OS, app version, browser (whatever applies)
   - `steps`: exact, numbered steps to reproduce
   - `expected` and `actual`
   - `evidence`: links, pasted output, or screenshots already saved (say so if there is none yet)
   - `suspectedArea`: the file, package or screen the owner suspects
   - `commit` is optional: leave it out and `bug-reporter` uses `git rev-parse HEAD`.

   Don't continue until every required field has real content from the owner.

3. **Call the Workflow.** Use the Workflow tool with `name: 'bugfix'` and:

   ```json
   {
     "issue": null,
     "reportOnly": true,
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

   If a field is still missing the Workflow returns `failed` with
   `missing-report-fields: <names>` and dispatches nothing; ask the owner for exactly those.

4. **Report the result.** `status` is one of:
   - `reported`: show the issue number (`issue`) and the labels applied, then offer
     `/bugfix <issue#>` to root-cause and fix it.
   - `duplicate`: an open ticket already covers it. Show that number (`issue`); the new evidence
     was commented onto it. Ask the owner whether to run `/bugfix <issue#>` on it.
   - `blocked` or `failed`: show `reasons` verbatim (e.g. a `gh` auth failure) and stop.

5. **Check before you report `reported` or `duplicate`.** This command makes no GitHub call
   itself, so check what the Workflow left behind: `issue` is a positive integer, a `reported`
   result lists the `bug` label, and `git ls-files docs/test-reports/bugs/<issue#>` shows the
   evidence `bug-reporter` committed. If any of these fails, say what you found instead.
