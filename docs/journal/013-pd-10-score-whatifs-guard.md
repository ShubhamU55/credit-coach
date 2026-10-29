# 013: PD-10, Score screen, what-ifs and the application guard

- **Date:** 2026-10-28
- **PRD refs:** section 5.5 (score estimate, what-ifs), section 5.6 (application guard); `docs/design.md` 6.13 to 6.15, 7.5
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-10.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-10.md`](../agent-runs/2026-10-28-pd-10.md)

## Goal

Show the score the way the product promises it: always a range with a zone word and the top reasons, never one number, plus six what-if scenarios from the predictor and the "too many applications" guard. Close-card must always carry the credit-age and limit-loss warning.

## What the AI did

- One implementer session, by hand and test-first, in its own worktree. No planner or reviewer agents ran (coordinator override); the coordinator reviews the diff.
- Wrote a small adapter from the plain demo data to the predictor's primitives, and checked it first against the golden fixture: the first test run gave 708-736 (Good) for Aarav with no tuning, and 724-752 for following the plan, which matches design.md section 8.
- Put all text and number decisions in a pure view model (tile list, zone bar from engine config, reason titles, outcome and guard wording) so the screens only lay them out. The close-card test asserts the engine's 698-726, not the mockup number.
- Used the kit's `WhatIfResult` close-card variant so both warnings come from fixed text that a caller cannot blank.

## Tests added

- Jest in `apps/mobile/src/screens/score`: adapter 8, view model 22, screen and what-if flows 19, Maestro-flow consistency 3. All pass; the Maestro flow itself was not run (no emulator allowed here).
- New flow `apps/mobile/.maestro/score-whatif.yaml`: Home -> Score -> Close HDFC Millennia -> warnings -> back.

## Review findings & fixes

- No reviewer ran in this session. Self-found: a complexity lint warning in `buildScenario` and `WhatIfConfigure` (split into helpers), a type error in my own back-button test.

## Where AI was wrong / where I overrode it

- A shell heredoc with an apostrophe in the text failed and wrote nothing; I switched to the editor tool for files.
- My first utilization expectation (54.5%) was wrong arithmetic: the excluded card's balance leaves the numerator too (54.3%). The test, not the code, was wrong.
- My first Maestro-flow consistency test had its filter inverted and reported the IDs that did exist as missing; it was a bug in the test, caught because the failure listed exactly the IDs I knew were there.
- Duplicate text on the result view ("improves your score" appears in the kit result and in the reason rows) broke three queries; I scoped them to the result card instead of changing the kit.

## What I learned

- The predictor needed no tuning for the golden range, which says the PD-2 config and the demo seed are consistent. The adapter is the only place that can drift, so it has the golden test.
- A paid-in-full card has no due day in the demo data but the planner's card needs one; it never reads it while nothing is due, so a constant is safe, but it is the kind of coupling worth a comment.
