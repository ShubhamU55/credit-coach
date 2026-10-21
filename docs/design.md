# Credit Coach — Design (v3 "Midnight")

**Status:** Current UI direction for the Android app, 21 Oct 2026.
**Scope:** Welcome, Home, Plan, Mark as paid (sheet), Score. Other screens are listed under [Not designed yet](#12-not-designed-yet).
**Mockups:** [design-mockups/v3/](design-mockups/v3/) holds the source of the five v3 screens.
- Welcome, Home and Score open directly in a browser.
- Plan and Pay are interactive. Outside the design canvas they show raw `{{…}}` placeholders.
- Where a mockup and this document disagree, this document wins.
**Requirements:** [PRD](PRD.md) wins wherever this document and the PRD disagree. Raise the conflict; don't pick one silently.

---

## 0. This supersedes `.design/` where they conflict

`.design/credit-coach/` holds the original Phase 1–6 spec (v1, "Swiss/Scandi, light-first"). It is still the source for IA, flows, screen inventory, copy tables and the admin. **For mobile visual design, this file wins.** The v1 → v3 changes:

| Topic | v1 (`.design/`) | v3 (this file) |
|---|---|---|
| Theme | Light-first, dark as an alternate | **Dark-first.** Light mode is not yet designed for v3 |
| Card identity | Issuer initials tiles ("HD", "SB", "AX") | Card "finishes" (graphite / navy / plum) with the full card name. Still no bank logos |
| Palette | Paper white + petrol accent | Near-black + one violet accent (§2) |
| Interface font | Inter | **Plus Jakarta Sans** (Fraunces stays for display) |
| Corner radius | 6px everywhere | **0.** Square corners on everything except dots |
| Elevation | Hairlines only, no shadows in flow | **Hard offset shadows** (no blur) on primary actions and hero surfaces (§4) |
| Press feedback | Scale 0.98 | **Translate by the shadow offset and drop the shadow** ("pop" press) |
| References | CRED was an anti-reference | CRED-like tactility is the reference. "Score-app casino" (gauges, confetti, single big score) is still an anti-reference |
| Bottom nav | Docked bar, 64px | Floating bar, 68px, inset 16px (§6.17) |
| Hero | Large number, no box | Next payment rendered as a **physical card** (§6.4) |

Unchanged from v1: the information architecture, the 4 tabs (Home · Plan · Score · Cards), the content hierarchy, number formatting, the voice ("casual & plain") and every product rule in §1.

---

## 1. Product rules the UI must enforce

These come from the PRD and `CLAUDE.md`. They are not stylistic, so don't trade them away for a cleaner layout.

1. **Never show a single predicted score.** Always a range with an en dash (`708–736`), always next to the word *estimate*, clamped to 300–900. Never a gauge needle on one number.
2. **Disclaimer, verbatim, on every screen that shows a score, utilization or a plan:**
   `Estimates only. Not your official CIBIL score. Not financial advice.`
   Style: 12/17 Plus Jakarta 400, `muted`. Place it at the end of the scroll content, above the nav clearance.
3. **PAN is masked** as first 2 + `XXXXX` + last 3: `ABXXXXX34F`. Never render a full PAN, even briefly.
4. **Closing a card:** any UI that suggests or simulates closing a card must warn about **credit age and limit loss** next to the result, not behind a link.
5. **AI text is labelled.** LLM-worded text always sits in the "Why this plan · AI-written" block (§6.16), with the label in `info`. The LLM never produces numbers. Every amount, date and percent in that block comes from the engine.
6. **Recording isn't paying.** Mark as paid must say: `This only records it here. Pay in your bank or UPI app.`
7. **Demo path:** "Try sample profile" is the primary CTA on Welcome. A "Sample profile · Switch" strip stays visible on every screen while the sample is active.

---

## 2. Color

### 2.1 Tokens (`theme.ts`)

```ts
export const color = {
  // structure
  bg: '#0B0B0D',          // app background
  surface: '#141417',     // cards, sheet, nav
  surface2: '#1C1C21',    // nested blocks: date blocks, initials tile, switch track (off)
  hairline: '#26262D',    // decorative borders and dividers, bar tracks on surface
  lineStrong: '#34343C',  // nav border, idle what-if tile border
  rule: '#3A3A44',        // timeline connector lines, dashed rules
  line: '#6A6A77',        // functional borders: inputs, outline buttons, unselected radios
  // text
  ink: '#F5F5F2',         // headings, numbers, primary text
  body: '#D4D4D8',        // paragraphs
  muted: '#9A9AA5',       // labels, captions, inactive nav, disclaimer
  // accent
  accent: '#9F86FF',      // primary action fill, selected, active-tab dot, plan bars
  onAccent: '#0B0B0D',    // text and icons on accent
  onAccentMuted: '#2A1A66', // secondary text on accent (selected radio sub-line)
  accentEdge: '#5A3FD6',  // pop-shadow color. Decorative only (see 2.3)
  link: '#B6A3FF',        // text links, italic headline emphasis, "you pay" labels
  // status
  success: '#4ADE80',  successTint: '#16261D',
  warning: '#FFB547',  warningTint: '#2A2112',
  error:   '#FF6B6B',  errorTint:   '#2E1616',
  info:    '#6CB6FF',
  // overlays
  scrim: 'rgba(0,0,0,0.72)',
  navShadow: '#000000',
} as const;

// Credit-card "finishes". Assigned by card order (1st graphite, 2nd navy, 3rd plum, then repeat).
// They are NOT bank branding: no bank colors or logos.
export const cardFinish = {
  graphite: { fill: '#1E1E24', border: '#6A6A77', muted: '#A8A8B3', track: '#34343C' },
  navy:     { fill: '#14203A', border: '#5875A8', muted: '#A9B8D0', track: '#24345A' },
  plum:     { fill: '#2A1730', border: '#8A5F96', muted: '#C2AFC9', track: '#4A2F52' },
} as const;

// Score zone bar fills (UI only, never text).
export const scoreZone = {
  poor: '#A04848', fair: '#8F6E2C', good: '#45698C', excellent: '#2F8253',
} as const;
```

> The mockup's navy border is `#4A6496`. It is **2.74:1** against the navy fill, so this spec raises it to `#5875A8` (3.49:1 on the fill, higher on `bg`). Use the token, not the mockup value.

### 2.2 Semantics: what each color is reserved for, and never used for

| Token | Reserved for | Never used for |
|---|---|---|
| `accent` | The one primary action per view; selected and active states; plan progress; "you pay" markers | Status of any kind; decoration; more than one filled button per view |
| `link` | Text links; the italic emphasis word in Fraunces headlines; pay amounts on the timeline | Body text; buttons with a fill |
| `success` | Improvements: after-plan numbers, "paid", left-over cash, factors that improve the score | Primary actions; "on target" (that stays `ink`/neutral) |
| `warning` | Time pressure (due soon, the "soon" date chip), over-threshold utilization, a shortfall under the minimum | Anything that isn't time- or threshold-related |
| `error` | Missed or overdue payments, validation errors, factors that lower the score | Utilization (that's `warning`); buttons; decoration |
| `info` | The "AI-written" label; the sample-profile dot | Status; links |
| `ink` | Headings, amounts, primary text, the score "now" block | Status meaning |

**Utilization coloring:** a card or overall value **above the threshold** (default 30%, configurable in admin) shows in `warning`, with its bar in `warning` and the label `⚠ OVER 30%`. **At or below** it shows in `ink`, with an `ink` bar and the label `✓ ON TARGET`. Never red, never a per-card rainbow.

### 2.3 Contrast (WCAG 2.2, verified)

Text needs 4.5:1; UI boundaries need 3:1.

| Pair | Ratio | Need |
|---|---|---|
| ink / bg | 18.00 | 4.5 |
| body / bg | 13.30 | 4.5 |
| muted / bg · surface · surface2 | 7.06 · 6.60 · 6.09 | 4.5 |
| link / bg · surface | 9.06 · 8.47 | 4.5 |
| onAccent / accent | 6.86 | 4.5 |
| onAccentMuted / accent | 5.10 | 4.5 |
| accent / bg (UI) | 6.86 | 3 |
| line / bg · surface (UI) | 3.69 · 3.45 | 3 |
| success / surface | 10.55 | 4.5 |
| warning / surface | 10.46 | 4.5 |
| warning / warningTint (date chip) | 9.02 | 4.5 |
| error / bg | 7.09 | 4.5 |
| info / bg | 9.15 | 4.5 |
| muted / hairline (disabled button) | 5.39 | 4.5 |
| plum: ink · muted · warning on fill | 15.21 · 8.13 · 9.46 | 4.5 |
| plum border / fill · bg (UI) | 3.29 · 3.89 | 3 |
| navy: muted · warning on fill | 8.06 · 9.21 | 4.5 |
| navy border `#5875A8` / fill (UI) | 3.49 | 3 |
| graphite: muted · warning on fill | 7.04 · 9.44 | 4.5 |
| graphite border / fill (UI) | 3.11 | 3 |
| error / errorTint · success / successTint (icon tiles) | 6.09 · 9.07 | 3 |
| score zones / surface (poor · fair · good · excellent) | 3.08 · 3.88 · 3.20 · 3.89 | 3 |

**Decorative only.** These must never be a control's only visible boundary:
- `accentEdge` `#5A3FD6` (2.92:1 on `bg`). A pop button is identified by its `accent` fill, not by its shadow.
- `hairline` `#26262D`. Inputs, outline buttons and radios use `line` `#6A6A77` instead.

---

## 3. Typography

Two families:
- **Fraunces** (serif) for display and voice moments: screen headlines, the score's *estimate* word, the AI explanation, and the "Recorded" confirmation.
- **Plus Jakarta Sans** for everything else, including every number.

### 3.1 Loading in Expo

Bundle static weights with `expo-font`. Install packages with `npx expo install`, not `pnpm add`.

- Fraunces: 400 Regular, 400 Italic, 600 SemiBold (logo monogram only).
- Plus Jakarta Sans: 400, 600, 700, 800.

The mockups set Fraunces' `SOFT` and `opsz` axes. React Native can't set variable axes, so use the static defaults. The italic emphasis carries the character.

**All numbers** use `fontVariant: ['tabular-nums']`.

### 3.2 Scale

Letter-spacing below is already converted to RN points (em × size).

| Role | Family / weight | Size / line | Tracking | Use |
|---|---|---|---|---|
| Display | Fraunces 400 | 40 / 44 | −1.0 | Welcome headline |
| Headline (h1) | Fraunces 400 | 34 / 38 | −0.7 | One per screen. One phrase in *italic* `link` |
| Confirmation | Fraunces 400 | 30 / 34 | −0.6 | "Recorded ₹12,400." |
| Voice | Fraunces 400 | 18 / 26 | 0 | AI explanation body |
| Estimate tag | Fraunces 400 Italic | 20 | 0 | The word *estimate* next to a score |
| Number XL | Jakarta 800 | 64 / 66 | −3.2 | Score range on Score |
| Number L | Jakarta 800 | 56 / 60–62 | −2.2 | Hero amount, after-plan utilization, sheet amount |
| Number M | Jakarta 800 | 30 / 34 | −0.9 | Stat tiles, card tiles, step numbers, cash input |
| Number S | Jakarta 800 | 22 | −0.66 | Step amount, left over |
| Number XS | Jakarta 800 | 17 | 0 | Timeline row amounts, card name on hero |
| Currency prefix | Jakarta 600 | ~45% of the number | 0 | `₹` before Number L/M in `muted` or the finish's muted color, top-aligned |
| Title | Jakarta 700 | 15–16 | 0 | Row titles, card names in lists |
| Body | Jakarta 400 | 14 / 21 | 0 | Hero sentence, confirmation text |
| Body S | Jakarta 400 | 13 / 19 | 0 | Step reasons, secondary paragraphs |
| Caption | Jakarta 400 | 12 / 17 | 0 | Captions, disclaimer |
| Overline | Jakarta 700–800, UPPERCASE | 11 | +1.5 | Section labels ("COMING UP"), field labels |
| Button | Jakarta 800, UPPERCASE | 14 (primary) · 12–13 (secondary) | +1.7 · +1.4 | All buttons and action links |
| Micro | Jakarta 800, UPPERCASE | 9–10 | +1.0–1.2 | Nav labels, date-block day/month, chart axis labels |

**Rules:**
- Fraunces never appears below 18px, and never on a number or a button.
- Only one italic phrase per headline, and it is the "so what" ("*on track.*", "*next 30 days.*", "*good*").
- Numbers are never Fraunces and never under weight 800 when they are the point of the block.
- Anything that can't wrap gracefully gets `numberOfLines={1}`: score ranges, amounts, percent-with-arrow lines. **A range must never split across lines.** If it doesn't fit, move its neighbour to the next line; don't shrink the range.

---

## 4. Shape, depth and press

**Radius:** 0 on every container, button, input, chip, tile, nav and sheet. Circles are allowed only for:
- status dots (6–7px)
- the active-tab dot (4px)
- the "Due" marker on the timeline.

**Hard offset shadows** (zero blur) use the RN `boxShadow` style prop, which RN 0.88 supports. **Don't use Android `elevation`:** it can't draw a hard offset.

```ts
export const shadow = {
  pop:        '4px 4px 0px #5A3FD6, inset 0px 1px 0px rgba(255,255,255,0.3)', // primary button
  popOnHero:  '4px 4px 0px #0B0B0D, inset 0px 1px 0px rgba(255,255,255,0.3)', // primary button on a card finish
  popSmall:   '3px 3px 0px #5A3FD6',  // selected what-if tile
  tileIdle:   '3px 3px 0px #26262D',  // idle what-if tile
  cardTile:   '4px 4px 0px #26262D',  // card carousel tiles
  hero:       '6px 6px 0px #5A3FD6',  // hero payment card
  nav:        '4px 4px 0px #000000',  // floating nav
  logo:       '3px 3px 0px #9F86FF',  // monogram
} as const;
```

**The pop press:**
- On `pressIn`, translate by the shadow offset (`translateX: 4, translateY: 4`, or 3 for `popSmall`) and set `boxShadow: 'none'`.
- The press animation is 80ms ease-out. With reduce-motion on (`AccessibilityInfo.isReduceMotionEnabled()`), jump straight to the pressed state with no animation.
- Give every element with an offset shadow a right margin equal to the offset, so the shadow stays inside the column.

Shadows exist only where they add hierarchy: primary actions, the hero card, card tiles, what-if tiles, the nav and the logo. **Plain information cards** (stat tiles, reason rows, step cards that aren't primary) get a 1px `hairline` border and **no shadow**.

---

## 5. Layout, spacing, motion

| Token | Value | Use |
|---|---|---|
| Screen gutter | 20 | Left and right padding of all content |
| Section gap | 28 | Between top-level sections in `main` |
| Card padding | 16 (tiles, rows) · 20 (hero, score card) | |
| Grid gap | 12 | Two-up tiles, what-if grid |
| Carousel gap | 16 | Card tiles. The carousel bleeds to the screen edge (negative gutter) |
| Header | 18 top padding; logo 36; icon buttons 48 | |
| Nav clearance | `paddingBottom: 120` on the scroll content | So the floating nav never covers the disclaimer |
| Touch target | **48dp minimum** | The mockups were checked against the 44px WCAG floor. Build to 48dp |

**Motion:** keep the v1 durations from `.design/credit-coach/DESIGN_TOKENS.md` §Motion (sheet 280ms, fade 180ms, strike-through 200ms, bar fill 400ms once per session), with two exceptions:
- the press is the 80ms pop press (§4)
- no scale animations.

With reduce-motion on, only opacity fades remain.

**Number and date formatting** is unchanged from v1:
- `₹` with Indian grouping (`₹1,20,000`), no decimals.
- Percent to 1 decimal place (`45.0%`).
- Dates as `Thu, 22 Oct`.
- Relative dates for 7 days or fewer ("tomorrow").
- Use an en dash in ranges, and `→` for before/after.

---

## 6. Components

Each component lists its anatomy, its states, and the **tempting-but-wrong** version.

### 6.1 Primary button ("pop")
- **Anatomy:**
  - `accent` fill, `onAccent` label (Button style) with an optional trailing arrow icon.
  - Height 56 (screen CTA) or 48 (inside a list); full width; `shadow.pop`.
- **States:** pressed (§4); disabled (`hairline` fill, `muted` label, no shadow, `accessibilityState={{disabled:true}}`).
- **Rule:** one per view.
- **Never:** a second filled button beside it; a rounded or pill shape; a gradient.

### 6.2 Secondary button
- **Anatomy:** transparent, 1px `line` border, `ink` label, height 48.
- **Used for:** Undo, the non-primary "Mark as paid" in step cards, "Create account".
- **Never:** an `accent` border, or a shadow.

### 6.3 Text action
- **Anatomy:** UPPERCASE Button style in `link` (or `ink` on a card finish), min height 48, no underline.
- **Examples:** "View full plan →", "Manage", "All 5 steps", "Switch".

### 6.4 Hero payment card (Home)
- **Anatomy, top to bottom:**
  - The next payment drawn as a physical card in the paying card's finish, with `shadow.hero`.
  - Overline "NEXT PAYMENT" and a due chip (`rgba(0,0,0,0.35)` bg, `warning` text, status dot).
  - The card name and a chip glyph.
  - `₹` plus the amount in Number L.
  - The sentence "By **Thu, 22 Oct** — clears your full statement, so **zero interest.**"
  - The minimum line ("₹620 of it is your minimum.").
  - A dashed divider in the finish border.
  - "THIS MONTH'S PLAN · 0 of 5 done" with a 5-segment bar (`rgba(0,0,0,0.4)` empty, `accent` done).
  - The primary button with `shadow.popOnHero`, then "View full plan →".
- **Rule:** the amount shown is the **statement amount** when the plan clears it. The minimum is mentioned, never hidden.
- **Never:** a bank logo; a full card number; the minimum as the headline when the plan pays more.

### 6.5 Card tile (carousel)
- **Anatomy:** 240×150, finish fill and border, `shadow.cardTile`.
  - Name and a chip glyph.
  - Utilization in Number M, colored per §2.2.
  - A status label (`⚠ OVER 30%` / `✓ ON TARGET`).
  - A 4px bar on the finish track.
  - A line like `₹81,000 / ₹1,00,000 · due 4 Nov` in the finish's muted color.
- **Never:** bank brand colors; a red bar.

### 6.6 Stat tile
- **Anatomy:** `surface` with a `hairline` border, padding 16.
  - Overline.
  - Number M (`warning` if over the threshold, else `ink`).
  - A 6px bar with a 2px `ink` target tick at the threshold (or the range block on a 300–900 scale for the score).
  - A caption.
  - A `success` delta line ("↓ 15.3% after plan", "↑ 724–752 with plan").
- **Rule:** the delta goes on its own line, never beside the number.
- **Never:** a ring or gauge; the delta chip on the number's row.

### 6.7 Date-block timeline ("Coming up")
- **Anatomy:**
  - A 48×58 block (`surface2`, `hairline` border) with the day (Micro), the date (20/800) and the month (Micro).
  - A 1px `rule` connector between blocks.
  - The row: title (Title), a reason line in `muted` such as "Pay before it's reported · 32% → 30%", and the amount (Number XS).
- **Rule:** the whole row is one pressable that leads to Plan.

### 6.8 Plan step card
- **Anatomy:**
  - The step number (Number M) outside the card on the left.
  - The card: kind overline ("PAY THE MINIMUM"), card name plus amount, a pay-by chip, a reason, and a before→after bar.
- **The before→after bar:**
  - The `accent` fill shows "after".
  - The removed part is drawn as a diagonal `muted` hatch with a 2px gap. Never as a second solid color.
  - A text label "19.5% → **18.7%**" sits beside it.
- **Pay-by chip:**
  - `warningTint`/`warning` with a `⚠` prefix when the pay-by date falls in the "soon" window (mockup: tomorrow; tie it to the admin reminder offsets).
  - Otherwise `surface2`/`body`.
- **States:**
  - **Primary** (the earliest unpaid step): `accent` border, `shadow` `4px 4px 0 accentEdge`, a step number in `link`, and a pop "Mark as paid".
  - **Secondary:** `hairline` border and a secondary "Mark as paid".
  - **Paid:** collapses to "Card · ₹amount" with a strike-through in `muted`, plus "✓ PAID · 21 OCT" in `success` and an inline **Undo**.
- **Never:** checkboxes to mark a step paid; removing paid steps from the list.

### 6.9 Payment timeline strip (Plan)
- **Anatomy:** one lane per card over 30 days (today → +30).
  - A `rule` baseline.
  - An `accent` square with a `2px 2px 0 accentEdge` shadow at the **pay-by date**, above the line.
  - An `ink` circle for the due date.
  - An outlined `ink` diamond (rotated square) for the statement / reporting date.
  - The pay label ("₹12,400 · 22 Oct") in `link`.
  - A legend: You pay / Due / Statement (reported).
  - An `accent` vertical line for today.
- **A11y:** the whole strip is one `accessibilityRole="image"` with a full sentence label per card. The label is dynamic; it changes with the 10% switch.

### 6.10 Switch
- **Anatomy:**
  - The whole row is the control (`accessibilityRole="switch"`, `accessibilityState={{checked}}`), at least 72 tall: title, plus a caption that changes with the state.
  - Square 56×30 track: off = `surface2` with a `line` border; on = `accent`.
  - Square 22 thumb: off = `ink` with a `2px 2px 0 #3A3A44` shadow; on = `bg` with an `accentEdge` shadow.
- **Never:** a pill track; a switch without a caption that says what changes.

### 6.11 Choice rows (radio group)
- **Anatomy:** in an `accessibilityRole="radiogroup"`, each row is a `radio` at least 52 tall: label (14/800), sub-line, amount, and an 18px square tick box.
  - Selected: `accent` fill, `onAccent` text, `onAccentMuted` sub-line, ✓ in the box.
  - Unselected: transparent, `line` border.
- **Never:** default radio dots.

### 6.12 Amount input
- **Anatomy:** Overline label above.
  - The field: `bg` fill, 1px `line` border, height 50, a `₹` prefix in `muted`, value 18/800, `keyboardType="number-pad"`.
  - A helper line below.
- **States:**
  - **Error:** 2px `error` border; message in `error` 700 ("Enter the amount you paid." / "That's more than the ₹15,600 outstanding."). The primary button is disabled.
  - **Warning** (below the minimum): 2px `warning` border; "⚠ ₹120 short of the ₹620 minimum. This counts as a missed payment — pay the rest by 22 Oct." The button label becomes **Record anyway**.
- **Inline edit variant (cash on Plan):** borderless Number M input inside a `surface` card, with an "✎ EDIT" text action whose label is tied to the input.

### 6.13 Score card
- **Anatomy:** `surface` card, padding 20.
  - Overline "ESTIMATED SCORE".
  - The range in Number XL (single line).
  - *estimate* (Fraunces italic, `link`) and "Not your official CIBIL score." in `muted`.
- **Zone bar:**
  - 14px, 4 segments with 3px gaps (§2.1 `scoreZone`).
  - An `ink` "now" block spanning the range, 24px tall, with a `3px 3px 0 bg` shadow.
  - Zone labels below (the current zone in `ink`).
- **With-plan lane:** below a dashed `rule`, an `accent` block for the plan range plus the label "With plan · 724–752" in `link`. It **never shares a line with the current range.**
- **Footer:** "Last reported 724 on 2 Oct · sample report".
- **Zone cut-points come from engine config and are placeholders.** The mockup draws Poor < 550 ≤ Fair < 650 ≤ Good < 750 ≤ Excellent, but the PRD's example band is "Good: 700–749" and PRD §11 says the band boundaries must be documented and admin-editable. Draw the bar from config. Don't hard-code these numbers.

### 6.14 Reason row
- **Anatomy:** `surface` with a `hairline` border.
  - A 36 square icon tile: `errorTint`/`error` ↓ for factors that lower the score, `successTint`/`success` ↑ for factors that improve it.
  - A title such as "Highest card at 81%".
  - A caption with the direction **in words** ("lowers your score · biggest drag"). Color is never the only signal.

### 6.15 What-if tile
- **Anatomy:** a 2-column grid, min height 92, `surface`.
  - An icon at the top and the label (13/700) at the bottom.
  - The suggested tile: `accent` border with `shadow.popSmall` and an icon in `link`.
  - Others: `lineStrong` border with `shadow.tileIdle`.
  - All use the pop press (3px).
- **Rule:** "Close a card" opens a result that carries the credit-age and limit-loss warning (§1.4).

### 6.16 AI explanation block
- **Anatomy:**
  - A 2px `accent` left rule.
  - The label "✦ WHY THIS PLAN · AI-WRITTEN" in `info`.
  - The body in Fraunces 18/26 `ink`.
- **Rule:** if the LLM fails or times out, show the template text with the same block. Change the label to "WHY THIS PLAN" (drop "AI-written").

### 6.17 Floating nav
- **Anatomy:**
  - Absolute, `left/right 16`, `bottom 20`, height 68.
  - `surface`, a 1px `lineStrong` border, `shadow.nav`.
  - 4 equal tabs (Home, Plan, Score, Cards): a 22 icon over a Micro label.
  - Active: `ink`, weight 800, and a 4px `accent` dot under the label, with `accessibilityState={{selected:true}}`.
  - Inactive: `muted`, weight 700.
- **Rule:** every scroll screen has `paddingBottom: 120`.

### 6.18 Header
- **Anatomy:**
  - The monogram "cc": 36 square, `ink` fill, Fraunces 600 `bg`, `shadow.logo`. **PLACEHOLDER: replace before ship.**
  - On the right: a reminders button (48, `hairline` border, a bell, and a 7px `warning` dot when there's something new; label "Reminders, 1 new").
  - The initials tile (48, `surface2`, "AM"; label "AM, account settings").
- **Below it:** the sample strip ("● SAMPLE PROFILE · SWITCH", `info` dot), when active.

### 6.19 Bottom sheet
- **Anatomy:** `scrim` over the screen.
  - The sheet: `surface` with a `line` top border, padding 12/20/28.
  - A 40×4 square grabber.
  - The title row with a 48 close button.
- **A11y:** the sheet is modal (`accessibilityViewIsModal`), the close button is first in focus order, and the success result is announced via `AccessibilityInfo.announceForAccessibility`.

### 6.20 Status chip
- **Anatomy:** height 24–26, square, Micro/Overline text, an optional 6px dot.
- **Variants:** due-soon (`warningTint`/`warning`), neutral date (`surface2`/`body`), on-finish (`rgba(0,0,0,0.35)`).

---

## 7. Screens

All screens are 360–412dp wide, gutter 20, scroll vertically. The order below is top → bottom. The sample data is in §8.

### 7.1 Welcome
1. Logo and the "CREDIT COACH" wordmark (Overline, `ink`).
2. A fanned stack of three card finishes (rotated −9°, −2°, 6°). The front card (plum) shows "AXIS NEO · BY THU", "₹12,400" and a progress bar. Decorative, hidden from accessibility.
3. Display headline: "Know exactly what to pay, where, and *when.*"
4. Three equal steps with a 2px `ink` top rule: 01 Which card first · 02 How much, by when · 03 Your score, as a range.
5. Spacer, then the pop **Try sample profile →**, and the caption "No sign-up · 10 seconds".
6. Secondary row: **Create account** (outline) · **Sign in** (text).
7. Disclaimer.

### 7.2 Home
1. Header and the sample strip.
2. h1: "Aarav, one payment keeps you *on track.*"
3. Hero payment card (§6.4).
4. Two stat tiles: Utilization `45.0%` (warning, ↓ 15.3% after plan) and Est. score `708–736` (*estimate* · Good, ↑ 724–752 with plan). Each opens Plan or Score.
5. "YOUR CARDS · 3" with Manage, then the carousel (§6.5).
6. "COMING UP" with All 5 steps, then the date-block timeline (§6.7): the next two steps other than the hero.
7. Disclaimer, then the floating nav (Home active).

### 7.3 Plan
1. Header, then the overline "21 OCT → 20 NOV".
2. h1: "Your plan for the *next 30 days.*"
3. Cash for cards: `₹1,20,000` with ✎ EDIT (§6.12 inline).
4. "AFTER THIS PLAN · UTILIZATION": `45.0%` struck through in `muted`, `→`, then `15.3%` in Number L `success`. Below it: "Highest card 81.0% → **30.0%**".
5. The payment timeline strip (§6.9).
6. "5 STEPS, IN ORDER": step cards (§6.8). The primary step is the earliest unpaid one by pay-by date.
7. A card with Left over `₹31,000` (`success`), a divider, then the switch **Aim for 10% utilization** (§6.10).
   - **Planner note:** this switch exists because of an owner decision on 21 Oct that amends PRD §5.3 step 4. By default step 4 stops at the threshold. Step 4(b), lowering cards toward the 10% line, runs only when the switch is on. It is off by default.
   - The decision is recorded in `.design/credit-coach/INFORMATION_ARCHITECTURE.md` ("Step-4 decision"). **The frozen PRD text has not been amended yet.** Until it is, build the planner per that decision, not per the original rule (b).
   - The v1 label was "Aim for excellent (under 10%)". v3 renamed it, because following the plan with the switch on still leaves the score in "Good".
8. The AI explanation (§6.16).
9. Disclaimer, then the nav (Plan active).

### 7.4 Mark as paid (bottom sheet over Home or Plan)
1. "MARK AS PAID" overline, "Axis Neo · due Thu, 22 Oct", and Close.
2. The chosen amount in Number L.
3. A radio group:
   - **Full statement** ₹12,400, "Steps 01 + 03 · zero interest". This is the default whenever the plan clears the statement.
   - **Minimum only** ₹620, "Step 01 · interest applies on the rest".
   - **Other amount**, "Partial payment".
4. If Other is chosen, the amount input (§6.12) with validation: 0 → error; above the outstanding amount → error; below the minimum → warning plus "Record anyway".
5. "Paid on today, 21 Oct · This only records it here. Pay in your bank or UPI app."
6. The pop **Confirm payment**.
7. **Done state:**
   - A 52 `success` square with a ✓ and a `4px 4px 0 successTint` shadow.
   - "Recorded ₹12,400." (Fraunces 30).
   - A result line, e.g. "Steps 01 and 03 are done. Axis Neo's statement is cleared — no interest this cycle."
   - The pop **Back to plan** and the secondary **Undo**.
   - Announce the result to screen readers.
8. **Rule:** recording a payment must update the plan state (the steps marked paid) everywhere. The mockup can't show this, because its screens don't share state.

### 7.5 Score
1. Header, then the overline "YOUR SCORE · CHECKED 19 DAYS AGO".
2. h1: "You're in *good* shape — and the plan helps." The italic word is the current zone.
3. The score card (§6.13).
4. "WHAT'S MOVING IT": reason rows (§6.14). Highest card at 81% (lowers), Overall utilization 45% (lowers), 36 months with zero missed (improves).
5. "TRY A WHAT-IF": 6 tiles (§6.15).
   - Follow this month's plan (suggested)
   - Pay an amount on a card
   - Miss a payment
   - Close a card
   - Apply for a card or loan
   - Open an FD-backed card
6. A `hairline` top rule, then "Checking your own score never lowers it.", followed by the text actions **Refresh sample report** and **How we estimate** (stacked, 48 each).
7. Disclaimer, then the nav (Score active).

---

## 8. Sample profile: Aarav (demo fixture)

This is a summary of the canonical data in `.design/credit-coach/INFORMATION_ARCHITECTURE.md` ("Canonical sample data"). **If the two disagree, that file is the seed source.**

- Today = **Wed 21 Oct 2026**.
- Persona: **Aarav Mehta (sample)**, the high-utilizer.
- PAN `ABXXXXX34F`, mobile `+91 98XXXXX210`.
- Reporting basis `statement`; threshold 30%; excellent line 10%.

| Card | Limit | Outstanding | Util. | Last statement | Min due | Due | Next statement (reported) |
|---|---|---|---|---|---|---|---|
| HDFC Millennia | ₹1,00,000 | ₹81,000 | 81.0% | ₹74,200 (15 Oct) | ₹3,710 | Wed 4 Nov | 15 Nov |
| SBI SimplyClick | ₹1,20,000 | ₹38,400 | 32.0% | paid in full | — | — | **Sun 25 Oct** |
| Axis Neo | ₹80,000 | ₹15,600 | 19.5% | ₹12,400 (2 Oct) | ₹620 | **Thu 22 Oct** | 2 Nov |
| **Overall** | ₹3,00,000 | ₹1,35,000 | **45.0%** | | | | |

> **Mockup mismatch:** the v3 Plan timeline draws an SBI "Due" marker and says "due 14 November" in its accessibility label. SBI's last statement was paid in full, so **it has no due date this cycle**. Draw no Due marker for SBI.

**Cash for cards:** ₹1,20,000. **Plan** (30% target · 10% switch on):

| # | Step | Card | Amount | Pay by | Utilization |
|---|---|---|---|---|---|
| 01 | Pay the minimum | Axis Neo | ₹620 | Thu 22 Oct | 19.5 → 18.7 |
| 02 | Pay the minimum | HDFC Millennia | ₹3,710 | Wed 4 Nov | 81.0 → 77.3 |
| 03 | Clear the statement | Axis Neo | ₹11,780 | Thu 22 Oct | 18.7 → 4.0 |
| 04 | Clear the statement | HDFC Millennia | ₹70,490 | Wed 4 Nov | 77.3 → 6.8 |
| 05 | Lower before it's reported | SBI SimplyClick | ₹2,400 · **₹26,400** | Sat 24 Oct | 32.0 → 30.0 · **10.0** |

| Outcome | 30% target | 10% switch on |
|---|---|---|
| Overall utilization after | 15.3% | 7.3% |
| Highest card after | 30.0% | 10.0% |
| Left over | ₹31,000 | ₹7,000 |
| Follow-plan estimate | 724–752 | 731–759 |

**Admin demo moment** (threshold changed to 20%, switch off): step 05 becomes SBI **₹14,400** (32.0% → 20.0%), and the left over becomes ₹19,000.

**Score and history:**
- Estimate 708–736 (Good).
- Anchor: CIBIL 724 on Fri 2 Oct 2026 (sample report).
- History: 36 months, zero missed.
- Oldest account: HDFC Millennia, 6 yrs 2 mo.
- 1 hard inquiry in the last 6 months.

**Placeholder:** the score weights and the zone cut-points (§6.13).

---

## 9. Voice and copy

- **Casual and plain.** Write as a calm friend who knows credit:
  - Short sentences.
  - Say the consequence: "so zero interest", "so only 10% gets reported".
- Headlines are sentence case in Fraunces, with one italic "so what". Labels are UPPERCASE overlines.
- Name the action and the amount: "Mark as paid", "Record anyway", "Back to plan". Never "Submit" or "OK".
- **Errors:** say what happened and what to do next ("₹120 short of the ₹620 minimum… pay the rest by 22 Oct.").
- **Never:**
  - hype ("Boost your score!")
  - urgency beyond the facts
  - "guaranteed"
  - an exact predicted score.
- For notification copy and empty, loading and error wording, use `.design/credit-coach/INFORMATION_ARCHITECTURE.md` and FILE 2. Restyle it to v3, but keep the words.

---

## 10. Accessibility (React Native mapping)

| Need | Implementation |
|---|---|
| Targets | `minHeight`/`minWidth` 48 on every pressable; `hitSlop` for small glyphs |
| Roles | `accessibilityRole`: `button`, `link`, `switch`, `radio`/`radiogroup`, `header` for h1/h2, `image` for charts |
| State | `accessibilityState`: `{checked}` (switch, radio), `{selected}` (active tab), `{disabled}` |
| Charts | Bars, the zone bar and the timeline strip each get one image role with a sentence label containing the numbers ("Utilization 19.5% to 18.7%") |
| Decorative | Card stacks, chip glyphs, dots and arrows: `importantForAccessibility="no-hide-descendants"` / `accessible={false}` |
| Live updates | `announceForAccessibility` after recording a payment, Undo and switch changes |
| Reduce motion | `AccessibilityInfo.isReduceMotionEnabled()`: no press translate animation, no slide, no bar fill animation |
| Font scaling | Allow scaling. At 200%, ranges and amounts may move to their own line, but they never truncate |
| Color | Status is never color-only: arrows, ⚠/✓ glyphs and words come with every status color |

---

## 11. Design review log (v3)

The mockups went through two independent review rounds before hand-off. These were fixed:
- The Home amount didn't match the sheet. The sheet now offers Full statement as the default.
- A partial payment below the minimum was accepted silently.
- Plan overflowed its frame.
- Touch targets were under 44.
- The nav covered the disclaimer.
- The timeline markers sat on the wrong date.
- "Aim for excellent" was mislabelled. It is now "Aim for 10% utilization", because the plan's score is still "Good".
- The Score screen had no headline.
- The score-zone colors had weak contrast.
- The v2 score range wrapped next to its chip. Hence the single-line rule in §3.

---

## 12. Not designed yet

Use `.design/` (v1) for structure and copy, and restyle to v3 tokens. Flag anything new for a design pass rather than inventing patterns.

- Cards tab (list and detail), Settings, the Reminders list
- What-if result screens (including Close a card with its warning)
- Overdue and missed-payment state on Home
- Bureau linking: consent, PAN entry with masking, the on-screen demo OTP
- Sign in and Create account
- Empty, loading (skeleton) and error states for every screen
- **Light mode.** v3 is dark-only for now
- **Web admin.** Stays on the v1 spec in `.design/` until a v3 pass is decided
- The final logo (the monogram is a placeholder)
