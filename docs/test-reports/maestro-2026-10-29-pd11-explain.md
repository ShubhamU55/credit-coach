# Maestro run note: PD-11 explanations (feat/pd-11-explain)

- Date: 2026-10-29
- Commit under test: a2d7b0f, built from a detached worktree at C:\p\t5
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t5" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=x86_64`. BUILD SUCCESSFUL in 12m 37s
- APK size: 30038207 bytes (x86_64 release)
- APK sha256: c6161c0380e97a9ca168ded37087255094a84773a614c8e154ace7b7d3c7ecd4
- Device: Pixel_7 AVD, headless: `emulator -avd Pixel_7 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect -memory 2048` (hw.cpu.ncore 2), `adb install -r`; Metro not running
- Command: `maestro test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd11-explain.xml --test-output-dir <tmp>` (from apps/mobile; the 8 kit screenshots were copied into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 25s |
| onboarding-try-sample | PASS   | 29 s   |
| smoke                 | PASS   | 6 s    |

3/3 flows passed in 2m 1s.

Honest note: the first `maestro test` run failed all three flows because a "System UI isn't responding" dialog (aerr_wait) covered the Welcome screen after the cold boot. After tapping Wait the flows were re-run unchanged against the same APK and passed. Earlier attempts on this commit failed because the host ran out of RAM (the emulator started with the default window and cores); that is why the lighter headless settings were used. No product code or flow was edited.
