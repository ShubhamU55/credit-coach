---
paths:
  - 'apps/mobile/**'
---

<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# React Native rules

Project rules for `apps/mobile` (Expo SDK 58, Android-only, sideloaded APK). Read
`apps/mobile/AGENTS.md` before any Expo API: the SDK differs from training data. `docs/design.md`
owns tokens, components and copy; `docs/standards.md` owns layout and testIDs.

## Structure

- Routes in `src/app/` stay thin: they read params and render a screen from `src/screens/`
  (`app/plan.tsx` → `PlanScreen`). No logic, state or engine calls in a route file.
- Screens compose the kit in `src/ui/` (`theme/`, `primitives/`, `components/`). Kit components get
  already-computed, already-formatted values; they never call the engine or format a raw number.
- Screen logic lives in a plain, unit-tested model or adapter next to the screen (`planModel.ts`,
  `score/viewModel.ts`), not inside JSX.

## State and data

- App data comes from the `DemoRepository` through `DemoRepositoryContext` hooks (`useCards`,
  `usePayments`, `useProfile`, `useRules`). Don't add a global store or a fetching library for it.
- Derive values from the engine on render; don't store a computed plan or score in state.
- Route params are untrusted (a deep link can set them). Validate them in the screen, take the
  first value of an array param (`mark-paid.tsx`), and never record a payment without a user tap.
- The only network call is `explain/`: https only, a 3 s timeout, and the template on any failure.

## Accessibility (design.md §10)

- Touch targets are at least `space.touch` (48 dp); use `PopPressable`, not a bare `Pressable`.
- A score range is one line: render it with `ScoreRangeText` (`numberOfLines={1}`, no
  `adjustsFontSizeToFit`). It must survive 200% font scale.
- Colour is never the only signal: pair it with text or a glyph (`StatusChip`, `ChipGlyph`).
- Respect reduce motion with `useReduceMotion`; announce changes with `announce`.
- Colours come from `src/ui/theme` only; a lint rule bans raw hex.

## Copy

- Every predicted score is a range labelled as an estimate (CLAUDE.md rule 3), with `Disclaimer`.
- Advice that could close a card warns about credit age and limit loss (rule 4).
- PAN appears only masked (`ABXXXXX34F`).

## Tests

- Jest (`jest-expo`) with `@testing-library/react-native`. Query by role, label or text; use a
  `testID` (kebab-case, per `docs/standards.md`) only for what Maestro also needs.
- Wrap screens in `DemoRepositoryProvider` with an injected repository, never the live default.
- Every user-facing flow has a Maestro flow in `apps/mobile/.maestro/` run against a release APK,
  not Metro (`maestro-android-e2e` skill). `demo-path.yaml` is the judge path and must pass.

## Dependencies and release

- Add packages with `npx expo install`, not `pnpm add`; the implementer agent never adds one.
- Before a build goes to a judge: `pnpm verify` green, Maestro flows pass on the release APK
  (`pnpm --filter @credit-coach/mobile android:release`), `npx expo-doctor` healthy, no secret in
  the bundle (only `EXPO_PUBLIC_*` and the anon key), and no keystore committed.
