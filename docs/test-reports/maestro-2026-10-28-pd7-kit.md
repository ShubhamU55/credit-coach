# Maestro run note: PD-7 kit gallery (feat/pd-7-kit-b)

- Date: 2026-10-28
- Commit under test: b29874c plus the flow-only commit 25c3dad (apps/mobile/.maestro/kit-gallery.yaml); the APK was built from a detached worktree at C:\p\t4 at b29874c
- Build: `expo prebuild --platform android`, then `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t4" } }` added inside the `android { }` block of the generated android/app/build.gradle (needed to stay under MAX_PATH, as in the PD-4 notes), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=x86_64`. BUILD SUCCESSFUL in 12m 25s. An earlier build at 09a82f8 failed because kit.test.tsx sat under the expo-router root and Metro bundled @testing-library; fixed in b29874c.
- APK size: 30034439 bytes (x86_64 release)
- APK sha256: a28cedab776f8c234f341ce5a6914e71eeeaeb21ef893f100dbc6640cfd713ec
- Device: Pixel_7 AVD (cold boot, no snapshot), `adb install -r`; Metro not running
- Command: `maestro test .maestro --format junit --output docs/test-reports/maestro-2026-10-28-pd7-kit.xml --test-output-dir docs/test-reports/ui-kit` (from apps/mobile)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 41s |
| onboarding-try-sample | PASS   | 33 s   |
| smoke                 | PASS   | 9 s    |

3/3 flows passed in 2m 23s. kit-gallery wrote 8 screenshots to docs/test-reports/ui-kit/ (buttons, form, info, cards, plan, score, chrome, chrome-sheet).

## Flow edits (kit-gallery.yaml only, no product code)
1. `openLink` right after `launchApp` was ignored (app stayed on Welcome), so the flow now waits for `welcome-screen` before opening creditcoach://kit, then waits up to 20 s for `kit-buttons-title`.
2. Maestro rejects `takeScreenshot` paths outside its output folder (`../../docs/...`), so the flow uses bare names and the run passes `--test-output-dir docs/test-reports/ui-kit`.
3. The chrome section scroll uses `speed: 30` and `visibilityPercentage: 50` because its title sat at the screen edge and the default 100% check failed.

Note: no "System UI isn't responding" dialog appeared this time.
