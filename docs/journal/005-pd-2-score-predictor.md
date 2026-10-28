# 005: PD-2. A rules-based score predictor that never shows one exact number

- **Date:** 2026-10-28
- **PRD refs:** §4 (F1, F3, F6), §5.5, §5.6; CLAUDE.md non-negotiables 1, 3, 4
- **Plan:** docs/superpowers/plans/2026-10-28-pd-2.md (Tasks 1–5)
- **Commits:** `8cff792..` on `feat/pd-2-predictor` (base `2836b93`)
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-2.md`](../agent-runs/2026-10-28-pd-2.md)

## Goal

Build the engine side of the Score screen: an estimated range plus its top 3 reasons, six what-if
scenarios, and the hard-inquiry application guard. It has to be pure, deterministic and rules-based,
and calibrated so the demo persona's numbers match the design.

## What the AI did

- **One Claude implementer session, working by hand.** A parallel-streams coordinator dispatched it
  with agent dispatch turned off.
- **It read the requirements before writing code:**
  - CLAUDE.md
  - docs/parallel-streams.md
  - PRD §4–§5.6
  - the `credit-domain` skill
  - design.md §6.13–§7.5 and §8
  - the IA's M11/M12 screens and F4/F5 flows
- **It wrote and committed a short plan first,** with the model formula decided up front so the
  tests could pin it.
- **It calibrated the weights in a throwaway scratch script before writing tests.** The fixture
  needs three exact ranges: 708–736 now, 724–752 with the plan, and 731–759 with the 10% switch on.
  - Constraints: the centres must be 722, 738 and 745, and they differ only in utilization.
  - What made it solvable: the ratio of the two plan shifts (16:23) fixed how steep the
    utilization curve must be below 30%.
  - The search was a few sweeps over weights and curve points, not ML.
- **It built test-first, one module at a time:**
  - predictor: 24 unit tests and 7 fast-check properties
  - guard: 8 tests, one of them a property
  - what-ifs: 18 unit tests and 4 properties
  - each was RED (module missing), then GREEN, then lint and format
- **It applied the `edge-case-hunter` checklist inline,** since agent dispatch was off. It covered
  leap-day anchors, future anchors, 300 and 900 slides, NaN, negative counts, over-limit
  utilization and closing the only card.

## Tests added

- **Vitest:** 61 new tests in 5 files; the engine total is 91.
- **Coverage:** 99.63% lines; `predictor.ts` and `whatif.ts` 100%.
- **The PRD §5.5 acceptance items are fast-check properties, not examples:**
  - lower utilization never lowers the estimate
  - a missed payment never raises it
  - closing a card never lowers utilization and always warns
  - no output carries a score-like field

## Review findings & fixes

- No reviewer agents ran in this session; the coordinator reviews after the report.
- The self-review was mutation testing (next section).

## Where AI was wrong / where I overrode it

- **The first property test was too weak, and a mutation showed it.** The AI made the utilization
  curve non-monotone at 0% on purpose, and the "lower utilization never lowers the estimate"
  property still passed. It drew two independent values over −20..200, so pairs rarely straddled
  the broken stretch. The rewrite draws a base value plus a small step, with the base biased
  towards 0–35. It now catches that mutation, a sign-flipped missed-payment penalty, and a
  close-card that drops the closed card's balance.
- **Docs disagree, so the AI chose and recorded a winner:**
  - **Non-negotiable 4 won over the IA flow F4.** F4 shows no age warning when the closed card
    isn't the oldest. Non-negotiable 4 requires a credit-age and limit-loss warning on every
    close. Both warnings are always returned, and `isOldestAccount` marks the oldest-card case.
  - **The calibrated model won over the IA mockup.** The mockup's close-oldest range (676–712)
    and guard copy ("10–25 points") aren't acceptance items, and the calibrated model gives
    698–726 and 4–12. These are flagged for PD-10 so the screen prints engine numbers, not
    mockup numbers.
- **A shared scratch log misled the AI briefly.** The first `pnpm verify` log turned out to come
  from a sibling worktree (`cc-pd3`), because another session wrote to the same file name. The
  AI noticed the path in the output and reran under a unique name instead of reporting someone
  else's result.

## What I learned

- Calibrate a rules model to the demo fixture **before** writing the fixture tests. Otherwise the
  "expected" numbers end up reverse-fitted inside the RED/GREEN loop.
- A property test that passes is only evidence once a deliberate mutation makes it fail.
  Generators must concentrate where the curve bends.
- For parallel sessions on one machine, give every log file a ticket-specific name.

## Time spent

Roughly 1.5 hours of agent time, plus a pause for the usage limit.
