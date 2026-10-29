# 012: PD-9, Plan screen and Mark as paid sheet

- **Date:** 2026-10-28
- **PRD refs:** 5.3 (planner, payment tracking); `docs/design.md` 6.8, 6.9, 6.12, 7.3, 7.4, 8
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-9.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-9.md`](../agent-runs/2026-10-28-pd-9.md)

## Goal

Replace the two stub routes with the real Plan screen and Mark as paid sheet, driven by the engine and the shared in-memory repository, so recording a payment changes the plan and Home.

## What the AI did

- One implementer session, by hand and test-first in its own worktree. The coordinator turned off `/build`, `planner` and sub-agents, so no second opinion ran.
- Wrote the view model's golden test first from design section 8 (both switch states and the admin 20% moment). The engine already produced those numbers; the work was the adapter.
- Hit a design conflict early: a plan recomputed only from current state drops a paid step, but design 6.8 says paid steps stay listed. Chose to add recorded payments back and settle steps per card in order, and wrote that down as a ruling.

## Tests added

- Jest in `apps/mobile`: view model (9), sheet model (14), Plan screen (7), Mark as paid sheet (11), route tests updated. Whole mobile suite: 34 suites, 616 tests.
- New Maestro flow `plan-mark-paid.yaml`. Not run in this session (no emulator); the evidence runner owns that.

## Review findings & fixes

- No reviewer ran; the coordinator reviews the diff.
- My first assertions were wrong in two honest ways: I expected step 02 to become primary after 01 and 03 were paid, but the rule is earliest pay-by date, so it is step 05; and the pay-by chip read "BY IN 3 DAYS", fixed to "BY SAT, 24 OCT".

## Where AI was wrong / where I overrode it

- Two heredoc writes were silently cut short by the shell tool, leaving a truncated model file. Caught because the tests did not run; rewrote the file with the editor tool.
- The kit's paid card shows an Undo button the repository cannot back. I kept the kit and made Undo announce that it is unavailable, rather than editing a file I do not own.

## Outcome

Plan for Aarav matches the golden table for both switch states; the 20% admin moment shows SBI 14,400; marking a payment updates the plan and Home. Undo, rules setters and the AI explanation hook are follow-ups listed in the ledger.
