# 011: PD-8, Welcome and Home screens

- **Date:** 2026-10-28
- **PRD refs:** PRD 5.1 (sample path), 5.2 (utilization, limit 0 excluded); `docs/design.md` 7.1, 7.2, 8, 9
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-8.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-8.md`](../agent-runs/2026-10-28-pd-8.md)

## Goal

Make the judges' path real: Welcome, one tap on "Try sample profile", then a Home screen that shows Aarav's numbers from the engine without any typing.

## What the AI did

- One implementer session, by hand and test-first, in its own worktree. The coordinator had switched off `/build`, `planner` and sub-agents, so nothing was reviewed in-session.
- Put all the logic in a pure adapter (`buildHomeModel`) and wrote its test first: the Aarav numbers (45.0%, 15.3% after the plan, the hero, the two "Coming up" rows, 708-736 and 724-752) came out of the engine on the first run, so the screens only format them.
- Built both screens only from kit components, and checked the result with component tests that query by role and text, not by implementation.
- Replaced the stub Maestro flow with one that walks Welcome, Home, Plan, Score and Mark as paid; not run, there is no emulator in this session.

## Tests added

- Jest in `apps/mobile/src/screens`: adapter 11, Welcome 4, Home 16. The stub Home test in `src/shell/routes.test.tsx` now checks the real screen.
- Maestro `onboarding-try-sample.yaml` rewritten (not run).

## Where AI was wrong / where I overrode it

- The ticket says "gauge with 30% and 10% markers"; design.md 6.6 says never a gauge, so I used the stat tile with its 30% tick.
- First hero pick was `plan.items[0]`. After recording the Axis minimum, the planner's first item is HDFC, whose due date is later than Axis's remaining statement. A test for the next hero exposed it; the hero is now the earliest pay-by date.
- A shell heredoc with an apostrophe failed and wrote nothing; I wrote files with the editor tool instead.
- Considered adding Create account / Sign in because design.md 7.1 lists them; dropped them because they would be dead controls on the demo path.

## What I learned

- RNTL queries skip nodes hidden from accessibility, so a "decorative, hidden" check needs `includeHiddenElements`.
- Maestro can only assert what is on screen, so the third card in a horizontal carousel cannot be asserted by id without a swipe; Jest covers it instead.
- The engine already excludes limit-0 cards from utilization; the adapter only had to keep them out of the tiles and say so.

## Time spent

One session (not timed). The device run of the Maestro flow is still to do.
