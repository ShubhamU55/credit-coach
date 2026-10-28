# Maestro run note: PD-4 app shell, rerun after the seed fix (feat/pd-4-app-shell)

- Date: 2026-10-28
- Commit under test: c6537c6 (behaviour-neutral Sonar fix in apps/mobile/src/demo/seed.ts), built from a detached worktree at C:\p\t3
- Build: `expo prebuild --platform android`, `buildStagingDirectory "C:/b/t3"` added to the generated android/app/build.gradle (see maestro-2026-10-28-pd4-shell.md), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=x86_64`. BUILD SUCCESSFUL in 18m 23s
- APK size: 29966731 bytes (x86_64 release)
- APK sha256: 852941e2a3362fa4d3672ed9e1c00d2b9c5149f4fb77babed8d519298babcdc9
- Device: Pixel_7 AVD (cold boot, no snapshot), `adb install -r`; Metro not running (8081 free)
- Command: `maestro test .maestro --format junit --output docs/test-reports/maestro-2026-10-28-pd4-shell-2.xml` (from apps/mobile; the flows are identical at c6537c6)

| Flow                  | Result | Time |
| --------------------- | ------ | ---- |
| onboarding-try-sample | PASS   | 35 s |
| smoke                 | PASS   | 9 s  |

2/2 flows passed in 44 s.

Honest notes: (1) the first emulator start failed with "not enough disk space" (about 2 GB free after the build); I freed space by deleting build output in the throwaway worktree and the emulator then booted. (2) As in the first PD-4 run, the first `maestro test` failed both flows because a "System UI isn't responding" dialog covered the Welcome screen; after tapping Wait the flows were re-run unchanged and passed. No product code or flow was edited.
