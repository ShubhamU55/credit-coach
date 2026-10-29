# 004: PD-1. The engine's types, reporting dates and payment planner

- **Date:** 2026-10-28
- **PRD refs:** §5.3 (payment planner), §5.4 (reporting-date awareness), §5.2 (utilization rounding, excluded cards)
- **Plan:** docs/superpowers/plans/2026-10-28-pd-1.md (Tasks 1 to 5)
- **Commits:** `775ff6e..` the docs commit on `feat/pd-1-planner` (base `2836b93`)
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-1.md`](../agent-runs/2026-10-28-pd-1.md)

## Goal

Give the product its hero logic: given the cards, the cash for the next 30 days and today's date, say what to pay, on which card and by when. Make it reproduce the Aarav golden plan in `docs/design.md` §8 to the rupee.

## What the AI did

- **One implementer session ran in its own worktree** (`../cc-pd1`), dispatched by a coordinator that ran four product streams in parallel.
- **The coordinator overrode the usual pipeline:**
  - no `/build`, no planner second opinion, no subagents
  - superpowers `test-driven-development` by hand
  - reviews left to the coordinator after the report
- **Reading came first:** the PRD §5.3 and §5.4 text, the `credit-domain` skill, design.md §8, and the IA file's canonical data. The IA file had two things design.md doesn't: the reason copy for each step, and Rohan's shortfall example ("₹1,550 of ₹2,880"). The reason sentences and the part-funded-minimum ruling were then written to match them.
- **One advisor consultation before any code shaped `types.ts`.** `types.ts` was committed alone (`775ff6e`) so the other streams could build against it straight away. The advisor's points that changed the code:
  - Derive "no due date" from the _remaining_ statement, not from a zero statement, because PD-4 might encode SBI's "paid in full" either way. There is now a test for both encodings.
  - Compare against the threshold in exact rupees, not on the rounded percent: 30.04% displays as 30.0% but is still above.
  - Don't throw on states that "Mark as paid" can produce (a credit balance, overpaying a statement).
  - Add a re-plan test: mark steps 01 to 03 paid one at a time, and assert that the rest of the plan and the ₹7,000 left over don't move. This test is the contract with PD-4's `recordPayment`.
- **TDD per task, RED confirmed each time.** The planner went GREEN on its first run against 21 tests. A deliberate mutation (removing the cash cap on minimums) confirmed the property suite fails when the planner over-allocates.
- **A self-review pass replaced two silent fallbacks with explicit invariant errors** (`?? 0` on a utilization that can only be null on a bug).

## Tests added

- Vitest, `packages/engine`: 73 new tests in 6 files; the engine total is 103.
  - `types.test.ts` 2
  - `reporting.test.ts` 22
  - `planner.golden.test.ts` 6
  - `planner.test.ts` 15
  - `planner.property.test.ts` 7 fast-check properties
  - `planner.edge.test.ts` 21
- Engine line coverage is 99.66%; `planner.ts`, `reporting.ts` and `planner.reasons.ts` are at 100% lines.
- No Maestro or Playwright tests: this ticket is engine-only.

## Review findings & fixes

- **Self-review (the silent-failure checklist):**
  - `prepay` looked up the start balance through a `Map` with a `?? s.outstanding` fallback, and used `?? 0` for utilization.
  - Both could only fire on a planner bug, and would have hidden it.
  - They now throw a named invariant error. The start balance travels with the paid amount.
  - Commit `f592b5c`.
- The coordinator's reviews (typescript-reviewer, silent-failure-hunter) run after this report and aren't recorded here.

## Where AI was wrong / where I overrode it

- **I wrote one wrong expectation in my own test.** For the "Aim for 10%" phase I expected a card at 25% to be lowered before a card at 30%. "Highest first" means the 30% card. I caught it by re-deriving the numbers before running the test. The replacement case (50% and 40%, ₹35,000) actually tells the two phases apart: a single-phase greedy would give all of it to the first card.
- **I nearly reported a pre-existing break.** The baseline `pnpm verify` ran in the background while I had already written the RED `types.test.ts`, so typecheck failed on my own missing module. The log showed it, so it wasn't reported as a base problem.
- **Ambiguity I resolved literally rather than "improving" it:** step 4 is sequential greedy, as the PRD words it, not levelling. Under short cash, levelling would give a lower maximum per-card utilization. This is recorded as a ruling with its cost.

## What I learned

- The design-team IA file held acceptance-grade detail (the reason copy, the shortfall example) that the PRD and design.md summarise away. Read the seed source, not only the summary.
- A "re-plan after paying" test is the cheapest way to catch double-counting between the minimum and statement steps. The minimum step and the statement step share `paidSinceStatement`, and that is where the bug would hide.
- Publishing the types file as its own first commit costs nothing and unblocks the parallel streams.

## Time spent

About 1.5 hours wall-clock, including reading.
