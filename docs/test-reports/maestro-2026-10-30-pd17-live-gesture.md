# Maestro run note: PD-17 app-to-Supabase batch (feat/pd-17-app-backend), gesture, 3-button and offline

- Date: 2026-10-30
- Rebase note: the runs used the branch before a second rebase onto `main` (which added #77 and #78: settings, CODEOWNERS and ledger files, no app or flow code). The hashes below are the pre-rebase ones; after it `a5a804a` is `dcf4100` and `1142a7b` is `cc55e01`. Same content, new hashes.
- Commit under test: `1142a7b` (last apps/mobile commit; the only change after the APK's source `a5a804a` is a Maestro flow edit, `score-whatif.yaml`, which is not bundled into the app, so the APK is unchanged by it)
- Build: incremental from the detached worktree `C:\p\t5` at `a5a804a`, generated `android/` reused, `buildStagingDirectory "C:/b/t5"` in place. `gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 2m 7s (25 executed, 505 up-to-date). The worktree's `.env.local` bakes the live `EXPO_PUBLIC_*` values in (not read by the agent).
- APK: `C:\apk\credit-coach-live-arm64.apk`, 30482471 bytes, sha256 `80bebe42d39b85ac66973ea94d3d89172756ee06ef1573b13eb0ca5f8a1bc17e` (arm64-v8a only; the fallback `credit-coach-release.apk` is untouched)
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, arm64-v8a; app uninstalled then freshly installed; Metro not running
- Command: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test --format junit --output <xml> .maestro` (from apps/mobile, all flows)

| Run            | Navigation        | Network                                                                        | Result      | Report                                               |
| -------------- | ----------------- | ------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------- |
| Full suite     | gestural (mode 2) | mobile data on, Wi-Fi off                                                      | 6/6, 3m 47s | `maestro-2026-10-30-pd17-live-gesture.xml`           |
| Full suite     | 3-button (mode 0) | mobile data on, Wi-Fi off                                                      | 6/6, 4m 5s  | `maestro-2026-10-30-pd17-live-3button.xml`           |
| demo-path only | gestural          | Wi-Fi and mobile data both off (0 internet networks in `dumpsys connectivity`) | 1/1, 59 s   | `maestro-2026-10-30-pd17-live-offline-demo-path.xml` |

Navigation was switched with the `navbar.threebutton` overlay and restored to gestural (mode 2) afterwards. Mobile data was re-enabled after the offline run. Wi-Fi was already off before the session and was left off.

## What failed first, and what changed

The first full run (gestural, before any edit) was 4/6:

- `demo-path` failed at `welcome-screen is visible` (20 s wait) 25 s into the first flow after a fresh install. It passed when run alone and in every later run. The cause is not established; the earlier handoff records the same pattern (first run 4/6, rerun 6/6).
- `score-whatif` failed at `score-screen is visible`. The failure screenshot shows Home with the Score tile cut by the floating nav (the `e5236c1` inset fix lifts the nav, so the tile at the fold is half covered). Maestro taps the tile's centre, which lands on the nav. `scrollUntilVisible` did not help, because a partly visible element counts as visible. Fix: one commit, `1142a7b`, adds an explicit `scroll` before the tap and a 10 s wait for the Score screen. No product code changed.

The three runs above are all after that commit.

## Not covered by this report

- The Mark as paid Confirm button's pixel position against the nav bar (y=2280) was not measured. `plan-mark-paid` taps Confirm and passes in 3-button mode, where the fallback APK's tap hit Home, so it is reachable; the bounds were not recorded.
- Only arm64 libraries were exercised. No all-ABI build has been run yet.
- The AI-written Plan sentence and the admin threshold demo were not checked: the Anthropic key is not yet scoped to a workspace, so the function answers `source = template`.
- Anonymous sign-in against the live project was not separately observed on the device; the flows pass with the env baked in.
