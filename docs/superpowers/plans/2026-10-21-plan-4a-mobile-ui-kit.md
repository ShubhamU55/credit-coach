# Plan 4a: Mobile UI Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested React Native component kit in `apps/mobile/src/ui/` that implements `docs/design.md` (v3 "Midnight"): tokens, fonts, formatters and the §6 components. Every screen in Plan 4b is built only from these parts, which keeps the UI consistent.

**Architecture:**
- **Tokens** (`theme/`): copied verbatim from design.md §2–§5. They are the only place colors, shadows, type and spacing are defined.
- **Primitives:** `Text` with variants, and `PopPressable`, which implements the pop press.
- **Components** (`components/`): one file per design.md §6 entry. Each is presentational. Props carry already-computed, already-formatted values. No engine calls and no state beyond the press and controlled inputs.
- **Formatters** (₹, %, dates, ranges, PAN mask) live in `packages/engine/src/format.ts` as pure functions. Admin will reuse them.
- **Gallery screen:** renders every component in every state. Maestro screenshots it for visual review against `docs/design-mockups/v3/`.

**Tech Stack:**
- Expo SDK 58 / React Native 0.88: `boxShadow` style prop, `AccessibilityInfo`
- `expo-font` + `@expo-google-fonts/fraunces` + `@expo-google-fonts/plus-jakarta-sans`
- Jest via `jest-expo`, plus `@testing-library/react-native`
- Vitest for the formatters
- Maestro

**Spec:**
- [docs/design.md](../../design.md): authority for the UI.
- [docs/PRD.md](../../PRD.md) v1.1: authority for requirements. The PRD wins on conflicts.

## Global Constraints

- **Install mobile packages with `npx expo install <pkg>`** (dev dependencies: `npx expo install <pkg> -- --save-dev`), never `pnpm add`.
- **Tokens are copied verbatim** from design.md §2.1 (`color`, `cardFinish`, `scoreZone`), §4 (`shadow`) and §5 (spacing). No other file may contain a hex color or a raw shadow string. The test in Task 1 enforces this.
- **Radius is 0 everywhere.** Circles appear only for status dots (6–7), the active-tab dot (4) and the timeline "Due" marker.
- **Shadows** use RN `boxShadow` strings. **Never** use `elevation` for them.
- **Fonts:**
  - Fraunces 400, 400 Italic and 600 only. Never below 18px, never on a number or a button.
  - Plus Jakarta Sans 400/600/700/800 for everything else.
  - All numbers use `fontVariant: ['tabular-nums']`.
- **Touch targets ≥ 48dp** on every pressable.
- **Reduce motion:** when `AccessibilityInfo.isReduceMotionEnabled()` is true, skip the press translate animation (jump to the end state) and skip slides and bar fills.
- **Copy fixed by design.md §1** must appear verbatim:
  - Disclaimer: `Estimates only. Not your official CIBIL score. Not financial advice.`
  - Mark-as-paid note: `This only records it here. Pay in your bank or UPI app.`
  - AI label: `✦ WHY THIS PLAN · AI-WRITTEN`, or `WHY THIS PLAN` for the template fallback.
- **testID convention:** kebab-case, component-prefixed, e.g. `pop-button`, `plan-step-0`, `score-range`.
- **Components never format raw numbers themselves.** They receive strings from `@credit-coach/engine` formatters, so the formatting rules live in one tested place.
- Commits use conventional commits with no AI attribution lines.

## Review Focus

1. **A score range wraps onto two lines** at large font scale or a narrow width (360dp). `ScoreRangeText` sets `numberOfLines={1}` and `adjustsFontSizeToFit={false}`. The test asserts `numberOfLines === 1`. design.md §3 says move the neighbour, never shrink the range.
2. **A hard-coded hex or shadow sneaks into a component.** Task 1's `no-raw-colors.test.ts` scans `src/ui/components/**` and `src/ui/primitives/**` for `#[0-9a-fA-F]{3,8}` and `boxShadow: '` literals and fails on any match.
3. **A status is shown by color alone.** Every status component test asserts a glyph or word as well as the color: `⚠ OVER 30%` / `✓ ON TARGET`, reason-row direction words, `✓ PAID`.
4. **A disabled `PopButton` still fires** `onPress`, or still shows its shadow. Task 4's test covers both.
5. **Indian grouping fails above ₹1 crore, or for 0 or negative amounts.** Task 2's `formatINR` tests cover `0`, `620`, `1,20,000`, `1,23,45,678` and negatives (`−₹500`).

---

### Task 1: Test harness, fonts and tokens

**Files:**
- Modify: `apps/mobile/package.json`
  - Add scripts: `test` (`jest`).
  - Add a `jest` config: `preset: 'jest-expo'`, `testMatch: ['**/src/**/*.test.ts?(x)']`, and `transformIgnorePatterns` per jest-expo docs, plus `@credit-coach/engine`.
- Create:
  - `apps/mobile/src/ui/theme/color.ts`: `color`, `cardFinish`, `scoreZone` (§2.1, verbatim)
  - `apps/mobile/src/ui/theme/shadow.ts`: `shadow` (§4, verbatim)
  - `apps/mobile/src/ui/theme/space.ts`
  - `apps/mobile/src/ui/theme/type.ts`
  - `apps/mobile/src/ui/theme/index.ts`
  - `apps/mobile/src/ui/fonts.ts`
- Test:
  - `apps/mobile/src/ui/theme/contrast.test.ts`
  - `apps/mobile/src/ui/no-raw-colors.test.ts`

**Interfaces:**
- Produces:
  - `color`, `cardFinish`, `scoreZone`, `shadow` (`as const`).
  - `space = { gutter: 20, section: 28, cardPad: 16, heroPad: 20, grid: 12, carousel: 16, navClearance: 120, touch: 48 }`.
  - `type`: a record keyed by role, each a `TextStyle` (fontFamily, fontSize, lineHeight, letterSpacing, textTransform when uppercase) taken from the §3.2 table:
    - `display`, `h1`, `confirmation`, `voice`, `estimateTag`
    - `numXL`, `numL`, `numM`, `numS`, `numXS`
    - `title`, `body`, `bodyS`, `caption`, `overline`, `button`, `buttonS`, `micro`
  - `CardFinish = keyof typeof cardFinish`, and `finishForIndex(i: number): CardFinish` (graphite → navy → plum, repeating).
  - `useAppFonts(): boolean`. It loads Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_600SemiBold, PlusJakartaSans_400Regular, _600SemiBold, _700Bold and _800ExtraBold, and returns `true` when ready.
  - `fontFamily = { serif, serifItalic, serifSemi, sans400, sans600, sans700, sans800 }`.

- [ ] **Step 1: Install the test and font packages:**
  - `npx expo install jest-expo jest @testing-library/react-native @types/jest -- --save-dev`
  - `npx expo install expo-font @expo-google-fonts/fraunces @expo-google-fonts/plus-jakarta-sans`
- [ ] **Step 2: Write the failing tests.**
  - `contrast.test.ts` defines `contrastRatio(hexA, hexB)` (WCAG 2.x relative luminance) inside the test file. It asserts every §2.3 row at or above its "Need" value:
    - `ink/bg` ≥ 4.5, `muted/surface2` ≥ 4.5, `onAccent/accent` ≥ 4.5
    - `cardFinish.navy.border` vs `cardFinish.navy.fill` ≥ 3
    - each `scoreZone` vs `surface` ≥ 3
    - plus **all** other rows in the table
  - `no-raw-colors.test.ts` globs the files described in Review Focus 2 and expects zero matches.
- [ ] **Step 3:** `pnpm --filter @credit-coach/mobile test`. Expected: FAIL (theme modules missing).
- [ ] **Step 4: Implement the theme files.** Values are copied from design.md. `fonts.ts` uses `useFonts` from `expo-font`.
- [ ] **Step 5:** `pnpm --filter @credit-coach/mobile test`. Expected: PASS. Then `pnpm verify`. Expected: PASS (mobile `test` now runs in verify).
- [ ] **Step 6: Commit** `feat(ui): add v3 theme tokens, fonts and contrast guard`.

---

### Task 2: Formatters in the engine (pure, shared with admin)

**Files:**
- Create: `packages/engine/src/format.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/format.test.ts`

**Interfaces:**
- Produces:
  - `formatINR(rupees: number): string`
    - Integer rupees, Indian grouping, no decimals, `₹` prefix.
    - Negatives as `−₹500` (U+2212).
  - `formatPercent(value: number): string`: 1 dp, e.g. `45.0%`.
  - `formatShortDate(isoDate: string): string`: e.g. `Thu, 22 Oct`. Input is `YYYY-MM-DD`, read as a calendar date with no time zone.
  - `formatRelativeDate(isoDate: string, todayIso: string): string`: `today`, `tomorrow`, `in N days` when N ≤ 7; otherwise `formatShortDate`.
  - `formatScoreRange(low: number, high: number): string`: clamps both to 300–900, orders them low ≤ high, joins with an en dash (`708–736`).
  - `maskPan(pan: string): string`: first 2 + `XXXXX` + last 3. The input is uppercased and trimmed. Throws `RangeError` unless it matches `^[A-Z]{5}[0-9]{4}[A-Z]$`.
  - `formatBeforeAfter(before: string, after: string): string`: `before → after`.

- [ ] **Step 1: Write the failing tests** (Vitest), asserting at least:
  - `formatINR`:
    - `0` → `₹0`
    - `620` → `₹620`
    - `120000` → `₹1,20,000`
    - `12345678` → `₹1,23,45,678`
    - `-500` → `−₹500`
    - `1999.6` → `₹2,000`
  - `formatPercent`: `45` → `45.0%`, `18.66` → `18.7%`
  - `formatShortDate`: `'2026-10-22'` → `Thu, 22 Oct`
  - `formatRelativeDate`:
    - `('2026-10-22','2026-10-21')` → `tomorrow`
    - `('2026-10-21','2026-10-21')` → `today`
    - `('2026-10-25','2026-10-21')` → `in 4 days`
    - `('2026-11-04','2026-10-21')` → `Wed, 4 Nov`
  - `formatScoreRange`:
    - `(708,736)` → `708–736`
    - `(736,708)` → `708–736`
    - `(250,320)` → `300–320`
    - `(880,950)` → `880–900`
  - `maskPan`:
    - `'ABCDE1234F'` → `ABXXXXX34F`
    - `' abcde1234f '` → `ABXXXXX34F`
    - `'ABC'` throws `RangeError`
  - `formatBeforeAfter('19.5%','18.7%')` → `19.5% → 18.7%`
- [ ] **Step 2:** `pnpm --filter @credit-coach/engine test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Dates are parsed manually into a `Date.UTC` value and formatted with fixed English day and month arrays, not `toLocaleDateString`, so the output is identical on Hermes, Node and CI. Indian grouping is done by hand (last 3 digits, then groups of 2).
- [ ] **Step 4:** `pnpm --filter @credit-coach/engine test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): add INR, percent, date, score-range and PAN formatters`.

---

### Task 3: Primitives: `Text` and `PopPressable`

**Files:**
- Create: `apps/mobile/src/ui/primitives/Text.tsx`, `apps/mobile/src/ui/primitives/PopPressable.tsx`, `apps/mobile/src/ui/primitives/useReduceMotion.ts`
- Test: `apps/mobile/src/ui/primitives/Text.test.tsx`, `apps/mobile/src/ui/primitives/PopPressable.test.tsx`

**Interfaces:**
- Consumes: `type`, `color`, `shadow` (Task 1).
- Produces:
  - `<Text variant={keyof typeof type} color?: keyof typeof color tabular?: boolean ...TextProps>`
    - `tabular` defaults to true for the `num*` variants.
    - `color` defaults to `ink` for headings and numbers, `body` for body text, `muted` for caption/overline/micro.
    - Variant `h1` sets `accessibilityRole="header"`.
  - `<PopPressable shadowKind: 'pop'|'popOnHero'|'popSmall'|'tileIdle'|'cardTile'|'hero' disabled?: boolean style? onPress ...PressableProps>`
    - The offset is 4 for every kind except `popSmall` and `tileIdle` (3) and `hero` (6).
    - Pressed style: `transform: [{translateX: o},{translateY: o}]` and `boxShadow: 'none'`.
    - Idle style: `boxShadow: shadow[kind]` and `marginRight: o`.
    - `disabled` means no shadow, no transform, `onPress` is not called, and `accessibilityState.disabled` is true.
  - `useReduceMotion(): boolean`

- [ ] **Step 1: Write the failing tests:**
  - `Text`: `variant="numL"` renders with `fontVariant` containing `tabular-nums`; `variant="h1"` has role `header`.
  - `PopPressable` (with `fireEvent(…,'pressIn')`):
    - pressing applies `translateX: 4` and `boxShadow: 'none'`
    - `shadowKind="popSmall"` translates by 3
    - `disabled` makes `onPress` not called and leaves no `boxShadow`
    - the idle style has `marginRight` equal to the offset
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `Pressable`'s `style={({pressed}) => …}`. The 80 ms ease-out applies only to the `Animated` variant. With reduce motion on, return the static pressed style.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add Text variants and PopPressable press primitive`.

---

### Task 4: Buttons (§6.1–6.3)

**Files:**
- Create: `apps/mobile/src/ui/components/Buttons.tsx`
- Test: `apps/mobile/src/ui/components/Buttons.test.tsx`

**Interfaces:**
- Consumes: `Text`, `PopPressable`.
- Produces:
  - `<PopButton label: string onPress size?: 'screen'|'list' onHero?: boolean disabled?: boolean trailingArrow?: boolean testID?>`
    - Height 56 (`screen`) or 48 (`list`), full width.
    - Label is uppercase in the `button` variant, colored `onAccent`.
    - `onHero` uses `popOnHero`.
  - `<SecondaryButton label onPress disabled? testID?>`: height 48, 1px `line` border, no shadow.
  - `<TextAction label onPress onFinish?: boolean testID?>`: min height 48, `link` color (`ink` when `onFinish`), `accessibilityRole="link"`.

- [ ] **Step 1: Write the failing tests:**
  - `PopButton`:
    - role `button`
    - rendered label text is uppercase (`'Try sample profile'` → `TRY SAMPLE PROFILE`)
    - height 56 by default, 48 with `size="list"`
    - `disabled`: `onPress` is not called, `accessibilityState.disabled` is true, and there is no `boxShadow` (Review Focus 4)
  - `SecondaryButton` has no `boxShadow` and `borderWidth: 1`.
  - `TextAction` has role `link` and `minHeight ≥ 48`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add pop, secondary and text-action buttons`.

---

### Task 5: Form controls (§6.10–6.12)

**Files:**
- Create: `apps/mobile/src/ui/components/Switch.tsx`, `apps/mobile/src/ui/components/ChoiceRows.tsx`, `apps/mobile/src/ui/components/AmountInput.tsx`
- Test: `apps/mobile/src/ui/components/FormControls.test.tsx`

**Interfaces:**
- Produces:
  - `<SwitchRow title: string captionOn: string captionOff: string value: boolean onValueChange(v: boolean) testID?>`
    - The whole row is `accessibilityRole="switch"` with `accessibilityState={{checked:value}}`, `minHeight` 72, and a square 56×30 track.
  - `<ChoiceRows<K extends string> options: {key:K,label,sub,amount:string}[] value: K onChange(k:K) testID?>`
    - The container is `radiogroup`. Each row is a `radio` with `checked`, `minHeight` 52, and a square 18 tick box (✓ when selected).
  - `<AmountInput label: string value: string onChangeText helper?: string status?: 'default'|'error'|'warning' message?: string inline?: boolean testID?>`
    - `keyboardType="number-pad"`, `₹` prefix.
    - Border width 1 (`line`), or 2 for `error` (`error` color) and `warning` (`warning` color).
    - `message` renders under the field, in the status color.

- [ ] **Step 1: Write the failing tests:**
  - `SwitchRow`:
    - pressing calls `onValueChange(!value)`
    - `accessibilityState.checked` reflects `value`
    - the caption shown is `captionOn` when on and `captionOff` when off
  - `ChoiceRows`:
    - three options give three `radio` roles
    - the selected one has `checked: true` and shows `✓`
    - pressing another calls `onChange` with its key
  - `AmountInput`:
    - `status="error"` gives `borderWidth: 2` and shows the message
    - `status="warning"` gives a warning-colored border
    - `keyboardType` is `number-pad`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add switch row, choice rows and amount input`.

---

### Task 6: Information blocks (§6.6, 6.14, 6.16, 6.20, §1 disclaimer, sample strip)

**Files:**
- Create: `apps/mobile/src/ui/components/StatusChip.tsx`, `Disclaimer.tsx`, `SampleStrip.tsx`, `AIExplanation.tsx`, `ReasonRow.tsx`, `StatTile.tsx`, `UtilizationLabel.tsx` (all under `apps/mobile/src/ui/components/`)
- Test: `apps/mobile/src/ui/components/InfoBlocks.test.tsx`

**Interfaces:**
- Produces:
  - `<StatusChip label variant: 'dueSoon'|'neutral'|'onFinish' dot?: boolean>`
  - `<Disclaimer />` renders the fixed disclaimer text in `caption`/`muted`, with testID `disclaimer`.
  - `<SampleStrip onSwitch() />` renders `● SAMPLE PROFILE · SWITCH`, with an `info` dot and a `TextAction` "Switch".
  - `<AIExplanation text: string aiWritten: boolean />`
    - 2px `accent` left rule.
    - The label is the fixed AI label when `aiWritten`, otherwise `WHY THIS PLAN`.
    - The body uses the `voice` variant.
  - `<ReasonRow title: string direction: 'lowers'|'improves' caption: string />`
    - A 36 square tile with ↓ (`error`/`errorTint`) or ↑ (`success`/`successTint`).
    - The caption must contain the direction word (Review Focus 3).
  - `<UtilizationLabel percent: number threshold: number />`
    - Above the threshold: `⚠ OVER {threshold}%` in `warning`.
    - Otherwise: `✓ ON TARGET` in `ink`.
  - `<StatTile overline value: string over?: boolean barPercent: number targetPercent: number caption delta?: string onPress? testID? />`
    - `hairline` border, no shadow.
    - The delta sits on its own line in `success`.
    - The bar has a 2px `ink` target tick at `targetPercent`.

- [ ] **Step 1: Write the failing tests:**
  - `Disclaimer` text equals the fixed copy exactly.
  - `AIExplanation`: the label switches between the two fixed strings with `aiWritten`.
  - `ReasonRow`:
    - `direction="lowers"` renders `↓`
    - the caption text includes `lowers`
    - `improves` renders `↑`
  - `UtilizationLabel`:
    - `(45, 30)` → `⚠ OVER 30%` in the warning color
    - `(30, 30)` → `✓ ON TARGET` (at the threshold counts as on target)
  - `StatTile`: there is no `boxShadow`, and the delta text is in a separate `Text` from the value.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add chips, disclaimer, sample strip, AI block, reason row, stat tile`.

---

### Task 7: Card surfaces (§6.4, 6.5)

**Files:**
- Create: `apps/mobile/src/ui/components/CardTile.tsx`, `apps/mobile/src/ui/components/HeroPaymentCard.tsx`, `apps/mobile/src/ui/components/ChipGlyph.tsx`
- Test: `apps/mobile/src/ui/components/Cards.test.tsx`

**Interfaces:**
- Consumes: `cardFinish`, `PopButton (onHero)`, `StatusChip`, `UtilizationLabel`, `TextAction`.
- Produces:
  - `<CardTile name finish: CardFinish utilPercent: number threshold: number line: string onPress? testID? />`
    - 240×150, `shadow.cardTile`.
    - The utilization uses `numM`, colored by the threshold.
    - A 4px bar sits on the finish track.
  - `<HeroPaymentCard finish cardName dueChip: string amount: string sentence: React.ReactNode minimumLine: string stepsDone: number stepsTotal: number onMarkPaid() onViewPlan() />`
    - `shadow.hero`, a dashed divider in the finish border color.
    - A segmented progress bar with `stepsTotal` segments, the first `stepsDone` in `accent`.
    - The primary button is labelled "Mark as paid" and uses `onHero`.
  - The chip glyph is decorative (`accessible={false}`).

- [ ] **Step 1: Write the failing tests:**
  - `CardTile` at 81% with threshold 30 shows `⚠ OVER 30%`. The bar fill width is `81%`, clamped to 100%.
  - `HeroPaymentCard` with `stepsDone=2, stepsTotal=5` renders 5 segments, 2 of them accent. The `minimumLine` text is present (never hidden).
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add card tile and hero payment card`.

---

### Task 8: Plan visuals (§6.7, 6.8, 6.9)

**Files:**
- Create: `apps/mobile/src/ui/components/PlanStepCard.tsx`, `DateBlockTimeline.tsx`, `PaymentTimelineStrip.tsx`, `BeforeAfterBar.tsx` (all under `apps/mobile/src/ui/components/`)
- Test: `apps/mobile/src/ui/components/PlanVisuals.test.tsx`

**Interfaces:**
- Produces:
  - `<BeforeAfterBar beforePercent: number afterPercent: number label: string />`
    - The `accent` fill shows after.
    - The removed part is a diagonal `muted` hatch with a 2px gap: repeated thin rotated `View` stripes clipped by `overflow:'hidden'`. No SVG dependency.
    - `accessibilityRole="image"`, and `accessibilityLabel` = `Utilization ${label}`.
  - `<PlanStepCard index: number kind: string cardName amount payBy: {label: string soon: boolean} reason before/after props state: 'primary'|'secondary'|'paid' paidLabel?: string onMarkPaid() onUndo() testID={`plan-step-${index}`} />`
    - `primary`: an `accent` border and the `4px 4px 0 accentEdge` shadow (via the token), with a `PopButton`.
    - `secondary`: a `hairline` border with a `SecondaryButton`.
    - `paid`: collapses to a struck-through `Card · ₹amount` in `muted`, plus `✓ PAID · {paidLabel}` in `success` and an inline Undo.
    - A pay-by chip with `soon` set is `dueSoon` with a `⚠` prefix.
  - `<DateBlockTimeline items: {day: string date: string month: string title: string reason: string amount: string}[] onPressItem(i) />`: 48×58 blocks with a 1px `rule` connector.
  - `<PaymentTimelineStrip todayIso: string lanes: {cardName: string payBy?: {iso,label}, due?: string, statement?: string}[] a11yLabel: string />`
    - A 30-day window positioned by percentage.
    - Markers: pay = an `accent` square with a 2px offset shadow; due = an `ink` circle; statement = an outlined `ink` diamond.
    - **A lane with no `due` draws no Due marker** (design.md §8 SBI note).
    - The whole strip is one `image` with `a11yLabel`.

- [ ] **Step 1: Write the failing tests:**
  - `PlanStepCard`:
    - `state="paid"` hides the "Mark as paid" button and shows `✓ PAID · 21 OCT` and `Undo`
    - `state="primary"` renders a `PopButton`; `state="secondary"` renders a `SecondaryButton`
    - `payBy.soon` shows `⚠`
    - there are never checkboxes (no `checkbox` role)
  - `PaymentTimelineStrip`: a lane without `due` renders zero elements with testID `due-marker`; a lane with `due` renders exactly one. The strip root has role `image` and the given label.
  - `BeforeAfterBar` has an `accessibilityLabel` containing `19.5% → 18.7%`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add plan step card, date-block timeline, payment timeline strip`.

---

### Task 9: Score visuals (§6.13, 6.15)

**Files:**
- Create: `apps/mobile/src/ui/components/ScoreCard.tsx`, `ScoreRangeText.tsx`, `WhatIfTile.tsx` (all under `apps/mobile/src/ui/components/`)
- Test: `apps/mobile/src/ui/components/ScoreVisuals.test.tsx`

**Interfaces:**
- Produces:
  - `<ScoreRangeText range: string size: 'XL'|'M' />`: `numberOfLines={1}`, testID `score-range`.
  - `<ScoreCard range: string zones: {name: string from: number to: number}[] currentZone: string nowLow: number nowHigh: number withPlan?: {range: string low: number high: number} footer: string />`
    - **Zones come from props**; there are no hard-coded cut points (design.md §6.13).
    - Shows the *estimate* word in `estimateTag`/`link` and "Not your official CIBIL score."
    - The with-plan lane renders on its own row below a dashed rule.
    - The zone bar is one `image` with a sentence label.
  - `<WhatIfTile icon: React.ReactNode label: string suggested?: boolean onPress testID? />`: `popSmall` when suggested, otherwise `tileIdle`; `minHeight` 92.

- [ ] **Step 1: Write the failing tests:**
  - `ScoreRangeText` has `numberOfLines` of 1 (Review Focus 1).
  - `ScoreCard`:
    - renders the word `estimate` and `Not your official CIBIL score.`
    - with `withPlan`, the plan range text is in a different row container from the main range
    - zones passed as `[{name:'Poor',from:300,to:550},…]` render as 4 segments whose flex widths are proportional to `to − from`
  - `WhatIfTile` with `suggested` uses the `popSmall` kind, otherwise `tileIdle`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add score card, range text and what-if tile`.

---

### Task 10: App chrome (§6.17, 6.18, 6.19)

**Files:**
- Create: `apps/mobile/src/ui/components/Header.tsx`, `FloatingNav.tsx`, `BottomSheet.tsx`, `Screen.tsx` (all under `apps/mobile/src/ui/components/`)
- Test: `apps/mobile/src/ui/components/Chrome.test.tsx`

**Interfaces:**
- Produces:
  - `<Header initials: string remindersNew: number onReminders() onAccount() sample?: {onSwitch()} />`
    - The monogram "cc" uses `shadow.logo`; it is marked as a placeholder.
    - The reminders button label is `Reminders, ${n} new` when n > 0.
    - The initials tile label is `${initials}, account settings`.
  - `<FloatingNav active: 'home'|'plan'|'score'|'cards' onNavigate(tab) />`
    - Absolute position: left/right 16, bottom 20, height 68.
    - The active tab has `accessibilityState.selected` and a 4px accent dot.
  - `<BottomSheet visible: boolean title: string subtitle?: string onClose() children />`
    - A `Modal` with the scrim. The sheet content has `accessibilityViewIsModal`.
    - The close button comes first in render order and has the label `Close`.
  - `<Screen children scroll?: boolean />`: a `SafeAreaView` with a `bg` background, gutter 20, and `paddingBottom: 120` when scrolling. It always renders `<Disclaimer />` last.
  - `announce(message: string): void` wraps `AccessibilityInfo.announceForAccessibility`.

- [ ] **Step 1: Write the failing tests:**
  - `FloatingNav active="plan"`: the Plan tab has `selected: true` and the others false; pressing Score calls `onNavigate('score')`.
  - `Header remindersNew=1` has the label `Reminders, 1 new`.
  - `BottomSheet visible`: the first pressable is labelled `Close`, and the content has `accessibilityViewIsModal`.
  - `Screen scroll` has a `paddingBottom` of 120 and contains the disclaimer as its last child.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add header, floating nav, bottom sheet and screen shell`.

---

### Task 11: Kit gallery, Maestro screenshots and visual review

**Files:**
- Create: `apps/mobile/src/ui/index.ts` (barrel export of the theme, primitives and components), `apps/mobile/src/kit/KitGallery.tsx`
- Modify: `apps/mobile/App.tsx` (load fonts, then render `KitGallery`)
- Create: `apps/mobile/.maestro/kit-gallery.yaml`, `docs/test-reports/ui-kit/` (screenshots)
- Modify: `apps/mobile/.maestro/smoke.yaml` only if the gallery header changes the asserted text. Keep "Credit Coach" and `engine-check` visible at the top of the gallery so `smoke.yaml` is unchanged.

**Interfaces:**
- Consumes: everything from Tasks 1–10, plus the design.md §8 sample values (Aarav), formatted with the Task 2 formatters.
- Produces: a scrollable gallery with one section per component, showing every state, with section testIDs `kit-<component>`. Plan 4b replaces `App.tsx` with Expo Router and moves the gallery to a `/kit` route.

- [ ] **Step 1: Write the failing flow** `kit-gallery.yaml`. For each section testID (`kit-buttons`, `kit-form`, `kit-info`, `kit-cards`, `kit-plan`, `kit-score`, `kit-chrome`): `scrollUntilVisible` → `assertVisible` → `takeScreenshot: ../../docs/test-reports/ui-kit/<section>`.
- [ ] **Step 2: Build and run.** `pnpm --filter @credit-coach/mobile android:release`, stop Metro, then `maestro test .maestro/kit-gallery.yaml`. Expected: FAIL (no `kit-buttons`).
- [ ] **Step 3: Implement `KitGallery`,** and update `App.tsx` to show a blank `bg` view until `useAppFonts()` returns true.
- [ ] **Step 4: Rebuild and run all flows** (`pnpm --filter @credit-coach/mobile e2e`). Expected: `smoke` and `kit-gallery` both pass, with 7 PNGs in `docs/test-reports/ui-kit/`.
- [ ] **Step 5: Visual review.** Dispatch the `react-reviewer` agent with the 7 screenshots, `docs/design.md` §2–§6, and the mockup HTML files. It must report:
  - mismatches in color, radius, shadow offset, type and spacing
  - any text under 48dp targets
  - any range that wraps
  
  Fix every mismatch the design doc settles. List the rest in the journal.
- [ ] **Step 6:** `pnpm verify`. Expected: PASS (engine and mobile Jest suites included).
- [ ] **Step 7: Commit and journal.** Commit `feat(ui): add kit gallery with Maestro screenshot review`, then `/journal UI kit`.
