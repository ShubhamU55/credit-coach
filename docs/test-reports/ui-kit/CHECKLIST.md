# UI kit gallery: screenshot checklist (Plan 4a task 11, PD-7)

**Status: on-device run NOT done by the implementer.** The implementer of PD-7 had no emulator (the machine is memory-tight; one emulator runs at a time). The gallery, the Maestro flow and this checklist are written and the Jest side is tested. The device run is **to be run by the coordinator's evidence runner**.

## How to run

From `apps/mobile`, with Metro stopped:

1. `pnpm --filter @credit-coach/mobile android:release` (builds and installs the standalone release APK on the running emulator).
2. The gallery flow is `apps/mobile/.maestro/kit-gallery.yaml`; it opens the dev-only `/kit` route (`creditcoach://kit`). Run `maestro test .maestro`.

Assumptions to confirm on the first device run (the implementer could not test them):

- `takeScreenshot` paths are resolved from the directory `maestro` runs in (`apps/mobile`), so `../../docs/test-reports/ui-kit/<name>` lands in this folder. If Maestro resolves them from the flow file instead, the PNGs land in `apps/docs/` (wrong): fix the relative prefix.
- `scrollUntilVisible` needs the whole element visible (its default `visibilityPercentage` is 100), and most sections are taller than one screen. So the flow scrolls to a small title anchor (`kit-<section>-title`), not to the section, then does `scroll` plus a screenshot three times. How far one `scroll` moves is a guess; adjust the number of shots or add `swipe` steps so each section is fully covered with no gaps.

Expected: both flows pass and this folder holds **22 PNGs**: `kit-<section>-1.png`, `-2.png`, `-3.png` for each of the seven sections, plus `kit-chrome-sheet.png`.

| Section (title anchor)                | What it shows                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `kit-buttons` (`kit-buttons-title`)   | pop buttons (screen, list, disabled, on a finish), secondary, text actions               |
| `kit-form` (`kit-form-title`)         | switch (off, on, disabled), choice rows, amount inputs (default, error, warning, inline) |
| `kit-info` (`kit-info-title`)         | chips, utilization labels, stat tiles, reason rows, AI blocks, sample strip, disclaimer  |
| `kit-cards` (`kit-cards-title`)       | hero payment card (plum), card tile carousel (graphite, navy, plum)                      |
| `kit-plan` (`kit-plan-title`)         | before/after bar, step cards (primary, secondary, paid), date blocks, timeline strip     |
| `kit-score` (`kit-score-title`)       | score range XL and M, score card with and without the plan lane, what-if tiles           |
| `kit-chrome` (`kit-chrome-title`)     | header (two states), floating nav, the "Open bottom sheet" button                        |
| `kit-chrome-sheet` (`kit-open-sheet`) | the bottom sheet open (scrim, grabber, Close first, Confirm payment)                     |

The flow also asserts the XL range `708–736` (`kit-range-xl`) is visible, and ends by scrolling to the fixed disclaimer.

## What to check on each screenshot (against `docs/design.md`)

Every screenshot:

- [ ] Background is `bg` `#0B0B0D`; cards are `surface`; no white flash, no light theme.
- [ ] No rounded corners anywhere except status dots, the 4px nav dot and the timeline Due circle.
- [ ] Hard offset shadows (no blur) on pop buttons, hero, card tiles, what-if tiles, nav and logo.
- [ ] Fraunces only on h1, the AI body, the `estimate` word and the monogram; numbers are Jakarta 800, tabular.
- [ ] Every pressable looks at least 48dp tall; no text action is a thin line of text.

Per section:

- **kit-buttons:** primary has the accent fill and an `accentEdge` shadow; disabled is `hairline` with a muted label and no shadow; secondary has a 1px `line` border and no shadow; on-finish uses the dark shadow.
- **kit-form:** switch track is a 56x30 square, thumb 22 square; choice rows show a square tick box, selected row is accent filled; error border is 2px `error`, warning 2px `warning`, and the message says what to do.
- **kit-info:** over-threshold shows `⚠ OVER 30%` in `warning`, never red; at target shows `✓ ON TARGET` in `ink`; reason rows say "lowers your score" / "improves your score" in words; the disclaimer reads exactly `Estimates only. Not your official CIBIL score. Not financial advice.`; AI label reads `✦ WHY THIS PLAN · AI-WRITTEN` and the fallback `WHY THIS PLAN`.
- **kit-cards:** hero shows the minimum line, a dashed divider in the finish border colour, a 5-segment bar with 2 accent segments; card tiles are 240 wide with a 4px bar on the finish track and no red.
- **kit-plan:** the removed part of the bar is a diagonal hatch with 2px gaps (not a solid block); primary step has an accent border and shadow; paid step is struck through with `✓ PAID · 21 OCT` and Undo; there are no checkboxes; **SBI has no Due marker**.
- **kit-score:** the range `708–736` is on one line at XL (no wrap, no ellipsis, no shrink); `estimate` and "Not your official CIBIL score." sit beside or under it, never squeezing it; the with-plan lane is on its own row under a dashed rule; the zone bar has 4 segments and an ink "now" block; the suggested what-if tile has an accent border.
- **kit-chrome:** the monogram is a placeholder (flag it in the review); the reminders button shows a 7px warning dot only when there is something new; the active nav tab is ink with a 4px accent dot; the sheet has a 40x4 grabber and Close at the top right.

Range check at large font (do once, on the Score screenshot): set the emulator font size to the largest, reopen the gallery, and confirm `708–736` does not wrap or truncate in the XL range and in the stat tile. The XL range and the stat-tile value cap their own font growth at 1.1 to guarantee this; if it still truncates at 360dp wide, record it as a finding.

## Findings

(To be filled in by the evidence runner after the device run: mismatches the design doc settles are fixed; the rest are listed in the PD-7 journal entry.)
