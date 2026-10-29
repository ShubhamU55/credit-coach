# Maestro run note: PD-9 Plan and Mark as paid, rerun after the S2871 sort fix (feat/pd-9-plan)

- Date: 2026-10-30
- Commit under test: 2618bd1 (last apps/mobile commit e39cff0, the behaviour-neutral sort comparator fix), built from the detached worktree C:\p\t5
- Build: reused the generated android/ dir (package.json, app.json and the mobile lockfile entries unchanged since it was generated, so no prebuild; `buildStagingDirectory "C:/b/t5"` MAX_PATH trick already in place), then `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 1m 30s (incremental: 25 tasks executed, 505 up to date, so this is not a clean-build time; the previous report's 35m 7s was a clean build)
- APK size: 29875067 bytes (arm64-v8a release), copied to C:\apk\pd9-arm64-rerun.apk
- APK sha256: 97ac51ca292c9701835a30ddc6ed15a293baa6ab9ac6fb54b19cffe5259770c3
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, arm64-v8a; installed with `adb install -r`; `svc power stayon usb`; battery 100% on USB; Metro not running
- Command: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-30-pd9-rerun.xml --test-output-dir <tmp>` (from apps/mobile; all flows in .maestro, none from .maestro-pending)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 17s |
| onboarding-try-sample | PASS   | 14 s   |
| plan-mark-paid        | PASS   | 53 s   |
| smoke                 | PASS   | 3 s    |

4/4 flows passed in 2m 28s on the first run, with no system dialog and no retries. No product code or flow was edited. The other session's processes were not running when the build and the run started.
