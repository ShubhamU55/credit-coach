# 019: PD-16, the product phase and the submission

- **Date:** 2026-10-29
- **PRD refs:** section 9 (deliverables, cut line); sections 5 and 6 for the status table
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-16.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-16.md`](../agent-runs/2026-10-28-pd-16.md)
- **Commits:** `git log 23ba4be..feat/pd-16-submission` (first `5909a9f`; this entry is in the last one)

## Goal

Close the product phase honestly: a README quick-start a judge can follow, a demo script, and a write-up that says what
was built, what was cut and how AI built it, without calling anything unmerged "shipped". This entry also summarises the
product phase (28 to 29 Oct) as a whole, since PD-16 is its last ticket.

## What the AI did

- **This ticket (one implementer session, docs only, by hand):** measured the state from git first (`origin/main`
  `23ba4be`, seven product PRs merged, four unmerged branches, no commits on PD-12 and PD-13), then wrote
  `docs/submission.md`, `docs/demo-script.md`, the README quick-start and this entry from the ledgers, citing each
  number to the ledger or command it came from. It did not edit `docs/status.md` (the coordinator owns it).
- **The product phase it summarises:** after the agentic system was built (journals 000 to 003), 16 tickets ran as
  parallel Claude Code sessions, one implementer and one git worktree per ticket, with disjoint file ownership
  (`docs/parallel-streams.md`). A coordinator session dispatched the reviewers (`code-reviewer`, `design-checker`,
  `react-reviewer`, `security-reviewer`, `silent-failure-hunter`, `edge-case-hunter`), ran one fix round at a time with a
  scoped re-review, pushed, opened PRs and kept a ledger with every ruling and its cost if wrong
  (`docs/agent-runs/2026-10-28-coordinator.md`). Device evidence ran through a dedicated evidence-runner agent, one job at
  a time on one emulator.
- **Numbers (floors, from the coordinator ledger):** at least 36 reviewer and tester runs, 10 fix rounds, 31 findings
  confirmed fixed by a scoped re-review in wave 1, 7 product PRs merged, 255 engine tests at 99.66% lines on `main`.

## Tests added

None. The ticket is documentation. The check was traceability: every status, count and string in the three documents was
checked against a commit, a ledger line, a test report or a command run in this session
(`pnpm --filter @credit-coach/engine test`: 255 passed; `vitest run planner.golden`: 6 passed). `pnpm verify` result and
the mobile and hooks counts are in the run ledger.

## Review findings & fixes

No reviewer ran on this ticket (coordinator override: the coordinator reviews the diff). I applied a self-check of
my own claims against the sources; it changed three claims before the first commit (next section).

## Where AI was wrong / where I overrode it

- **First draft: every APK "x86_64 only".** The coordinator ledger shows PR #56's evidence APK was 68 MB; the
  x86_64-only Gradle build was first used for PR #58. Corrected to "30 to 68 MB; all but the first x86_64 only".
- **First draft: PD-5 "security-reviewed".** The ledger shows a `security-reviewer` only on PD-4, PD-9 and PD-11; PD-5 had
  the implementer's own checklist. Corrected.
- **The demo script's terminal command would have failed the coverage gate.** `pnpm --filter ... test planner.golden`
  runs `vitest run --coverage` with a global threshold. Replaced with `exec vitest run planner.golden --coverage.enabled=false`
  and ran it (6 passed).
- **A Python edit script on a machine with no Python.** It failed with no change made; I used the editor tool.
- **The ticket text and the addendum disagree** on `docs/status.md` (fold the ledgers in, versus never edit it) and on
  `README.md` (unowned in `docs/parallel-streams.md`, named in the ticket). I followed the addendum: no `status.md` edit,
  README edited additively. Ruling recorded in the ledger.

## What I learned

- **"Built" is not "shipped".** Four of the most important screens exist on branches with passing Jest tests and no device
  run. A status table with exact words ("built, awaiting device evidence") is more useful to a judge than a rounded-up
  claim, and it is cheap to write if the state is measured from git first.
- **The process phase cost the product its schedule.** The PRD planned the core done by 27 Oct; the agentic system took
  that time. The parallel-streams plan is what recovered it, and its cut order (admin, reminders, linking) held.
- **Device evidence is the bottleneck, not code.** A cold release build took 12 to 24 minutes per run and the Windows
  260-character path limit broke the native build until it was routed around with a short checkout path and a CMake
  staging directory. Writing Maestro flows without being able to run them is how three screens ended up awaiting evidence.
- **Reviewers chosen by changed path found real defects** (a 100x money error in an amount field, a score range that could
  collapse to one exact number, a planner case that hid an unpaid minimum). They were still agents of the same family as the
  implementers, and the product phase did not use the `/build` Workflow at all: the honest framing is "manual loop with AI
  reviewers", not "autonomous pipeline".

## Time spent

One session for this ticket (not timed). The product phase it describes ran 28 to 29 Oct.
