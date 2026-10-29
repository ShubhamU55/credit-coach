# Demo video script (3 to 5 minutes)

Shot list and voice-over for the submission video (PRD section 9, deliverable 2). The video is also the fallback if
the APK does not install, so it has to stand on its own. Target length: about 4 minutes 30 seconds, leaving margin inside the 3 to 5 minute limit.

## Read this first: what the video can show

The numbers and strings below come from the golden fixture (`docs/design.md` section 8), the engine tests on `main`,
and the screens on the three unmerged branches `feat/pd-8-welcome-home` (Welcome, Home), `feat/pd-9-plan` (Plan, Mark
as paid) and `feat/pd-10-score` (Score, what-ifs). As of 2026-10-29 none of those screens is on `main`. PD-8 is PR #65 (open) with a Maestro report on a physical phone
(Welcome to Home only); PD-9 has a report for Plan and Mark as paid on its branch; PD-10 has no device report. All pass
their Jest tests. So:

- **Record segments 2 to 7 only from a build that contains PD-8, PD-9 and PD-10.** Do not record them from `main`
  as it stands; `main` has stub screens for Home, Plan, Score and Mark as paid.
- **Re-check every on-screen string and number against the real build while recording.** Where a line below says
  "per design 7.4" it is the design's wording and the screen was not seen on a device.
- If the screens are still unmerged at recording time, use the **stub-state cut** at the end of this file. Do not
  describe a stub as the finished app.
- The admin demo moment (threshold 30% to 20% in the admin panel) is **not shipped** (PD-14 is cut). Segment 4b shows
  the same effect as an engine test and says so.

## Before recording

- Fresh install, or "Clear storage" in Android settings, so Welcome is the first screen (the Maestro flows use
  `clearState: true`).
- Record on the physical phone or the Pixel 7 emulator, screen only plus voice. Release APK, Metro not running.
- The app works offline and with no backend, which is worth saying once: airplane mode on, and nothing breaks.
- The demo date is fixed at Wed 21 Oct 2026 in the app (one constant, `DEMO_TODAY`), so the dates on screen will
  not match the real date. Say so in segment 1.
- A terminal with the repo open for segments 4b and 8.

## The script

Times are cumulative. The voice-over is plain: short sentences, say the consequence, no hype, never promise a score.

### 1. The problem (0:00 to 0:20)

**Screen:** the Welcome screen, not yet tapped.
**Say:** "In India, the credit bureau sees the balance your bank reports, usually the statement balance, not what is
left after you pay by the due date. So someone who pays in full every month can still look like they are maxed out.
Credit Coach tells you what to pay, where and when, to fix that. Everything you will see is a sample profile, and the
dates are fixed to 21 October."

### 2. Try sample profile (0:20 to 0:35)

**Screen:** tap **Try sample profile** (test id `welcome-try-sample`). Note the caption "No sign-up, 10 seconds".
**Say:** "No sign-up, no SMS code. One tap opens Aarav's profile."
**Check:** Home appears in a couple of seconds with nothing typed.

### 3. Home (0:35 to 1:15)

**Screen:** Home (`home-screen`). Pause on each item.

- Headline "Aarav, one payment keeps you on track."
- Hero card: Axis Neo, 12,400 rupees by Thu 22 Oct, "620 of it is your minimum."
- Utilization tile `45.0%` (135,000 of 300,000), with the arrow to `15.3%` after the plan.
- Estimated score tile `708 to 736`, **labelled estimate**, Good, and `724 to 752` with the plan.
- Scroll to the three cards (81.0%, 32.0%, 19.5%) and the "Coming up" rows, then the disclaimer.

**Say:** "Three cards, 45 percent used overall. The HDFC card is at 81 percent. The score is a range, never one number,
and it says it is an estimate. The top of the screen is the one thing to do first: pay Axis Neo by Thursday."

### 4. The plan (1:15 to 2:05)

**Screen:** tap "All 5 steps" (`home-all-steps`) to open Plan (`plan-screen`, period "21 OCT to 20 NOV").

- Point at the five steps: Axis minimum 620 (22 Oct), HDFC minimum 3,710 (4 Nov), Axis statement 11,780 (22 Oct),
  HDFC statement 70,490 (4 Nov), then SBI.
- "After this plan": utilization 45.0% to 15.3%; highest card 81.0% to 30.0%; left over 31,000.
- Toggle **Aim for 10% utilization** on (it is off by default): left over becomes 7,000 and the SBI step grows
  to 26,400; overall 7.3%, highest card 10.0%. Toggle it back off.

**Say:** "The order is fixed and the reason is stated on each step: minimums first so nothing goes overdue, then
clear statements because that is the balance that gets reported, then bring the highest card under 30 percent. If
the cash does not cover it, the shortfall is shown, never hidden. The switch is for people who want to go further."

#### 4b. The admin moment, as a test (2:05 to 2:25)

**Screen:** terminal.

```bash
pnpm --filter @credit-coach/engine exec vitest run planner.golden --coverage.enabled=false
```

Highlight the test named "admin demo moment, threshold 20% and switch off".

**Say:** "In the full design an admin changes the threshold from 30 to 20 percent and the plan changes. The admin
panel was cut for time, so here is the same rule as a test: with a 20 percent threshold the SBI step becomes 14,400
rupees and the left over 19,000."

### 5. Mark as paid (2:25 to 2:50)

**Screen:** on Plan, scroll to step 01 and tap **Mark as paid** (`plan-step-1-mark-paid`); the sheet opens
(`mark-paid-sheet`, "Axis Neo, due Thu, 22 Oct").

- Choose **Minimum only**: the amount reads 620 (the PD-9 Maestro flow asserts this) and the Done state reads
  "Recorded 620." (`mark-paid-recorded`). Back on Plan, step 01 is struck through as paid and the rest is unchanged.
- Optional, if you prefer the stronger story: choose **Full statement** instead (12,400, "zero interest" per design
  7.4) and read the line that Axis Neo's statement is cleared. Check the wording on the device.

**Say:** "Marking a payment only records it here; you pay in your bank or UPI app. The plan updates, and so does
Home."
**Note:** there is no Undo button (a recorded ruling: the demo repository has no undo). Do not mention one.

### 6. Score and a what-if (2:50 to 3:30)

**Screen:** Home, tap the score tile (`home-stat-score`) to open Score (`score-screen`).

- The range `708 to 736` (`score-range`), the zone word, the three reasons with arrows, "last reported 724 on 2 Oct".
- Scroll to the six what-ifs. Tap **Close a card** (`score-tile-close-card`), choose HDFC Millennia, **See the
  result**.
- The result: `698 to 726`, lower, with the two warnings: the credit-age line (oldest account 6 years 2 months drops
  to 3 years 2 months) and the limit-loss line (100,000 of limit gone).

**Say:** "Closing your oldest card usually hurts the score, so the app says so before you do it: it shortens your
average credit age and removes limit, which pushes utilization up. These ranges come from the rules engine, not from
the AI. The AI never computes a number."

### 7. Why this plan? (3:30 to 3:45)

**Screen:** Plan, scroll to the "Why this plan?" block.
**Say:** "The explanation is written from the plan's own numbers. Today it is template text, and it works with no
network. When the optional AI function is deployed it only rewords those numbers, labels the result as AI-written, and
falls back to the template if anything is off."
**Honest note:** on every build to date the block shows the template and no AI label (section 6 of
`docs/submission.md`). Do not imply a live AI call unless the function has been deployed and the PD-9 screen wired to
the PD-11 hook.

### 8. How AI built it (3:45 to 4:15)

**Screen:** `docs/ai-system.md` (the diagram), then `docs/agent-runs/2026-10-28-coordinator.md`, a PR's checks list,
then the engine test run (255 tests).
**Say:** "I built this with Claude Code as the engineering team. First I built the process: 26 agents, workflows
with a drift guard, and a review loop where a verifier tries to refute every finding. Then 16 tickets ran in parallel,
one agent per ticket, with a coordinator dispatching reviewers. Reviews found real bugs: a hundred-times money error
in an amount field, a config that could collapse the score range to one exact number, and a planner case that could
hide an unpaid minimum. Everything is in the repo: the journal, the run ledgers, and the rulings with what each would
cost if wrong."

### 9. Honest close (4:15 to 4:30)

**Screen:** the status table in `docs/submission.md` section 3.
**Say:** "What is not here: sign-in and bureau linking, reminders, and the admin panel were cut. The backend is
written and tested but not deployed. The write-up says exactly what is and is not proven."

## Stub-state cut (if PD-8, PD-9 and PD-10 are not merged at recording time)

Keep the video honest and still 3 minutes: segment 1 (over the Welcome stub), the kit gallery (`/kit` route: every
component, ranges that never wrap), the engine golden tests running in the terminal (the Aarav plan table, the
predictor's 708 to 736 range, the close-card warning test), segment 4b, segment 8, segment 9. Say in the voice-over that
the screens exist as built-but-unmerged branches and that this is the engine and the kit.

## Checklist for the person recording

- [ ] Fresh install, airplane mode on, screen recording started before the first tap.
- [ ] Every number said aloud matches the screen at that moment.
- [ ] No full PAN or phone number appears (the sample shows `ABXXXXX34F` only; do not open any real account).
- [ ] No exact score is presented as "your score". The only single number is the sample bureau figure 724, labelled
      last reported.
- [ ] Length 3 to 5 minutes; upload and paste the link into `docs/submission.md` and the submission form.
