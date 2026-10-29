# Maestro run note: PD-7 kit gallery, rerun on bfa84b6 (feat/pd-7-kit-b)

- Date: 2026-10-29
- Commit under test: bfa84b6 (only change since the 2026-10-28 run is a unit-test string), built from a detached worktree at C:\p\t4
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t4" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=x86_64`. BUILD SUCCESSFUL in 16m 18s. (A first attempt failed with "not enough space on the disk" because the drive was full of crash dumps; disk was freed and the build redone from scratch.)
- APK size: 30034439 bytes (x86_64 release)
- APK sha256: a5835424da55486b99d03345da42c5a418672cb7abe5cddb74775e50caf6e6f1
- Device: Pixel_7 AVD (cold boot, no snapshot), `adb install -r`; Metro not running; no System UI dialog appeared
- Command: `maestro test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd7-kit-2.xml` (from apps/mobile; screenshots collected into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 43s |
| onboarding-try-sample | PASS   | 26 s   |
| smoke                 | PASS   | 5 s    |

3/3 flows passed in 2m 14s. The 8 kit screenshots in docs/test-reports/ui-kit/ were overwritten by this run. No product code or flow was edited.
