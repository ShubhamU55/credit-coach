# Maestro run note: PD-10 rerun after the Score sample strip and engine-error hardening (feat/pd-10-score)

- Date: 2026-10-30
- Commit under test: 273d125 (last apps/mobile change 9ddb7a5, "add Score sample strip and harden engine-error paths"), built from the detached worktree C:\p\t5
- Build: incremental, not clean. The generated android/ directory in C:\p\t5 (prebuilt earlier, with `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t5" } }` for MAX_PATH) was reused; no package.json, app.json or lockfile change since the previous report, so no re-prebuild. `.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 1m 9s (25 executed, 505 up-to-date). The short time is the incremental build; the previous report's 22m 40s was a clean build.
- APK: C:\apk\pd10-arm64-rerun.apk, 29868447 bytes (arm64-v8a release), built 2026-10-30 01:09 IST
- APK sha256: f843f6f4da71020c37d96e956ea6f50fd100452d5b2b0d807537412abb2d6662
- Device: physical moto g73 5G (serial ZD22299HZT), arm64-v8a; installed with `adb install -r`; Metro not running; no other gradle or maestro session active (only idle Gradle/Kotlin daemons)
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output ../../docs/test-reports/maestro-2026-10-30-pd10-rerun.xml --test-output-dir C:\p\t5-out` (from apps/mobile, MAESTRO_DRIVER_STARTUP_TIMEOUT=180000)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 18s |
| onboarding-try-sample | PASS   | 13 s   |
| score-whatif          | PASS   | 32 s   |
| smoke                 | PASS   | 4 s    |

4/4 flows passed in 2m 7s on the first run, with no system dialog and no retries. score-whatif (25 s before, 32 s now) still reaches the warnings with the new sample strip above the content; the extra time is consistent with one more element to scroll past. No product code or flow was edited.
