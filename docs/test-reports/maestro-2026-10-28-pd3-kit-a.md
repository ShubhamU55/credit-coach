# Maestro run note: PD-3 kit part A (feat/pd-3-kit-a)

- Date: 2026-10-28
- Commit under test: b5dded0 (built from a detached worktree at C:\p\t2 because of the Windows MAX_PATH limit)
- Build: `expo run:android --variant release` first tried to open the emulator before building and was cancelled (low free RAM). The same release variant was then built directly: `gradlew app:assembleRelease -x lint -x test --configure-on-demand --build-cache -PreactNativeDevServerPort=8081 -PreactNativeArchitectures=x86_64` (prebuild already done by expo). Gradle BUILD SUCCESSFUL in 4m 58s (warm Gradle build cache, 98 of 274 tasks from cache)
- APK: apps/mobile/android/app/build/outputs/apk/release/app-release.apk (release variant, x86_64 only, hence smaller than the all-ABI APK of the PR #56 note)
- APK size: 22834349 bytes
- APK sha256: 981d569d63af7ae4d062996f3a5797f4f4c75450c58f7689224eb93b50610223
- Device: Pixel_7 AVD (emulator 36.6.11.0, Android 17, x86_64, cold boot, no snapshot), APK installed with `adb install -r`
- Tools: Maestro 2.11.0, OpenJDK 17.0.19, Node v24.16.0, pnpm 12.14.0
- Metro: not running (port 8081 free); release APK uses bundled JS
- Command: `maestro test .maestro --format junit --output docs/test-reports/maestro-2026-10-28-pd3-kit-a.xml` (from apps/mobile)

| Flow  | Result | Time |
| ----- | ------ | ---- |
| smoke | PASS   | 21 s |

1/1 flow passed. Wall-clock for the passing Maestro run: 59 s. Only `smoke.yaml` exists in `apps/mobile/.maestro/` at this commit.

Honest note on a first attempt: the first `maestro test` run on the freshly booted emulator failed `smoke` ("Credit Coach" not visible) because a "System UI isn't responding" dialog (`android:id/aerr_wait`) covered the app after the slow boot. After tapping Wait (per the maestro-android-e2e skill) the flow was re-run unchanged against the same installed APK and passed. No product code or flow was edited.
