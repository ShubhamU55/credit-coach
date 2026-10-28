---
description: 'Run the retro Workflow over recent run ledgers (per-agent stats, then proposed prompt edits for owner approval). Use after several workflow runs, to find agents whose prompts need work.'
argument-hint: '[how many recent ledgers, default 5]'
---

<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

Run the `retro` Workflow over the last **$ARGUMENTS** run ledgers (default 5). `retro` finds the
agents that cost the most (retries, escalations, refuted findings) and has a read-only `planner`
propose one prompt edit each. It **proposes only**: nothing edits an agent file until the owner
approves that proposal.

1. **Pick the ledgers.** List `docs/agent-runs/*.md`, sort by filename (they start with the
   date), take the newest N, and read each one in full. `args.ledgers` is the array of their texts.

2. **Call the Workflow.** Use the Workflow tool with `name: 'retro'` and
   `{ "ledgers": ["<text of ledger 1>", "<text of ledger 2>", ...] }`. Nothing else is needed;
   the clock is never read (the stats are pure functions of the ledgers).

3. **Report the stats first.** Show `stats` (per agent: `runs`, `retries`, `escalations`,
   `falsePositiveRate`) as a table, and `diagnostics`. If `diagnostics.withoutStats` equals
   `diagnostics.total`, say plainly that **no ledger carried an `Agent stats` table, so there
   is nothing to analyze** (see the format below); don't present an empty result as a clean bill
   of health. Also report `diagnostics.malformedRows` (rows skipped as malformed).

4. **Present each proposal for owner approval**, using the `learn-eval` verdict model. Show the
   agent, its stats, the `rationale` and the `diff`, then act on the verdict:
   - **Save**: a new, specific rule. Apply the diff after the owner confirms.
   - **Improve**: valuable but needs refinement. Show the refined diff, apply it after the owner
     confirms.
   - **Absorb**: belongs in an existing section (`absorbInto` names it). Apply after the owner
     confirms.
   - **Drop**: not worth a change. Show the rationale only; nothing to confirm.

   List every `failedCandidates` agent too: the planner's result was missing or unusable, so
   there is no proposal for it, which is not the same as "no problem".

5. **Apply only what the owner approved**, one agent per commit, with the stats that justified it
   in the commit body (`docs/agent-runs/` is the history judges read). Run `pnpm verify` first (the
   agent lint covers every agent file). Never edit an agent file the owner did not approve, and
   never apply a diff that touches a file other than the proposal's `target`.

## The ledger format `retro` reads

`retro` reads one structured form: a markdown table with an `Agent` column and any of the count
columns `Runs`, `Retries`, `Escalations`, `Confirmed`, `Refuted` (column order and header case
don't matter; an empty cell, `-` or `—` counts as 0). `Confirmed` and `Refuted` are the findings
that agent reported which `finding-verifier` confirmed or refuted; `falsePositiveRate` is
refuted / (confirmed + refuted).

```markdown
## Agent stats

| Agent                | Runs | Retries | Escalations | Confirmed | Refuted |
| -------------------- | ---- | ------- | ----------- | --------- | ------- |
| implementer          | 3    | 2       | 0           | —         | —       |
| consistency-reviewer | 2    | 0       | 0           | 1         | 3       |
```

Agent names must be slugs (`implementer`, `code-reviewer`); a row with any other name or a
non-numeric count is skipped and counted in `diagnostics.malformedRows`. Other tables in a ledger
(attempts, findings, anything without an `Agent` column) are ignored.
