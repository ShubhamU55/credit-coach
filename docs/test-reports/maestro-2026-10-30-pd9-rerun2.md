# Maestro run note: PD-9 Plan and Mark as paid, rerun on the merged head (feat/pd-9-plan)

- Date: 2026-10-30
- Commit under test: 5569621 (merge of main, which brought in PD-5's apps/mobile/src/explain changes; last other apps/mobile commit 3e33ea5, Mark as paid sheet made modal, cash bound), built from the detached worktree C:\p\t5
- Build: incremental, not clean. The generated android/ dir was reused (apps/mobile package.json and app.json unchanged since it was generated; the merge only added a supabase importer to pnpm-lock.yaml, so no prebuild; `buildStagingDirectory "C:/b/t5"` MAX_PATH trick already in place). `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 1m 11s (25 executed, 505 up-to-date)
- APK size: 29876619 bytes (arm64-v8a release), copied to C:\apk\pd9-arm64-merged.apk
- APK sha256: e7d83eb2dd89e7bbac2e1a17715e75d0ad4ab793a8a6a88b442c59b29ae42867
- Device: physical moto g73 5G (serial ZD22299HZT), arm64-v8a; installed with `adb install -r`; battery 100% on USB; Metro not running; no other gradle or maestro session active at build or run start
- Command: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output ../../docs/test-reports/maestro-2026-10-30-pd9-rerun2.xml --test-output-dir C:/p/t5-out9` (from apps/mobile; all flows in .maestro, none from .maestro-pending)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 18s |
| onboarding-try-sample | PASS   | 14 s   |
| plan-mark-paid        | PASS   | 49 s   |
| smoke                 | PASS   | 3 s    |

4/4 flows passed in 2m 24s on the first run, with no retries. No product code or flow was edited.
