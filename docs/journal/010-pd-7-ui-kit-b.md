# 010: PD-7, mobile UI kit part B (information blocks, plan and score visuals, cards, chrome, gallery)

- **Date:** 2026-10-28
- **PRD refs:** none directly; implements `docs/design.md` sections 1, 3, 4, 6.4 to 6.9, 6.13 to 6.20, 9 and 10
- **Plan:** `docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md` (tasks 6 to 11), run from `docs/superpowers/plans/2026-10-28-pd-7.md`
- **Commits:** `b6fae9b` .. `da8bd4b` on `feat/pd-7-kit-b`, on top of PD-3's `b5dded0`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-7.md`](../agent-runs/2026-10-28-pd-7.md)

## Goal

Finish the mobile UI kit so every screen stream can build from tested parts: the information blocks (chip, disclaimer, sample strip, AI block, reason row, stat tile, utilization label), the plan visuals, the score visuals, the card surfaces, the app chrome, a barrel, and a gallery that shows every component in every state for a Maestro screenshot review. Delivered in three groups so screen streams could start from the plan and score visuals first.

## What the AI did

- One implementer session, by hand and test-first, in its own worktree on top of the unmerged PD-3 branch. The coordinator had turned off `/build`, `planner` and sub-agents, so no second opinion and no `design-checker` ran; I wrote the PD-3 review lessons into the plan and applied them as a checklist (whole-field 48dp targets, `minHeight` never `height`, ranges and amounts on one line, status never colour alone, tests that fail when the behaviour is removed).
- Asked an advisor model once before writing code. Its points that changed the work: put the extra tokens in a new file instead of editing PD-3's theme, query decorative nodes with `includeHiddenElements` so "no Due marker" cannot pass by accident, make `ReasonRow` write the direction words itself, give ranges a font-scale cap because `numberOfLines={1}` alone still ellipsizes, and add a barrel test that fails on a forgotten export.
- Checked RN 0.88's own source for `SafeAreaView` (deprecated, a plain `View` on Android) before writing `Screen`, instead of using it from memory.
- Spot-checked that a test can fail: forced the Due marker to always render and confirmed two timeline tests went red.

## Tests added

- Jest in `apps/mobile`: 11 new suites. Info blocks 36, plan visuals 42 (two files), score visuals 34, cards 26, chrome 25, bottom sheet 10, barrel 54, gallery 24 (including a check that every section id in `kit-gallery.yaml` exists in the gallery), tokens and percent helpers 9, plus 24 more cases in the part-A raw-colour scan (one per new source file). Whole mobile suite at the end: 20 suites, 490 tests, 0 failed.
- New Maestro flow `apps/mobile/.maestro/kit-gallery.yaml` (7 section screenshots plus the open sheet). **Not run**: no emulator in this session. The coordinator's evidence runner does the device run with `docs/test-reports/ui-kit/CHECKLIST.md`.

## Review findings & fixes

- No reviewer ran in this session; the coordinator reviews the diff afterwards.
- One self-found fix before any review: the stat-tile value could truncate in a half-width tile at large font, so it now caps its own font growth like the score range (`bbd3c11`).

## Where AI was wrong / where I overrode it

- First pass at two tests was weak: a children-length check that proved nothing, and a wrong expected percent for the now block (I had `67.83%`; `(708 - 300) / 600` is `68%`). Replaced one, corrected the other.
- Wrote the hero card's progress text with a hard-coded `plum` colour; the type checker did not catch it (it is a valid colour). Found on re-read and passed the finish colour in instead.
- Left an empty re-export and a meaningless `fontFamily: undefined` in the first draft of the cards section; removed both before committing.
- A shell heredoc failed silently and the next command ran on nothing; files are written with the editor tool.
- The plan and ticket say `src/kit/`; followed PD-3's ruling and the coordinator addendum (`src/ui/`), and put the gallery at `src/ui/gallery/`.

## What I learned

- The commit hook rejects `style:` as a type and any subject over 72 characters; the first message I wrote for task 6 was 76.
- RNTL v14's default queries skip nodes hidden from accessibility, which is exactly right for screen readers but means a "this marker is absent" test must opt in to hidden elements, or it passes for the wrong reason.
- Prettier rewrites YAML quotes, so a test that greps the Maestro flow has to normalise quotes.

## Time spent

One long session for the six tasks, ledger and journal (I did not time it). The device run is still to do.
