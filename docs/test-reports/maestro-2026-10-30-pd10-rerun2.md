# Maestro run note: PD-10 Score and What-if, rerun on the merged head (feat/pd-10-score)

- Date: 2026-10-30
- Commit under test: efd9308 (merge of main, which brought in PD-5's apps/mobile/src/explain changes), built from the detached worktree C:\p\t5
- Build: incremental, not clean. The generated android/ dir was reused (apps/mobile package.json and app.json unchanged; the merge only touched pnpm-lock.yaml, so no prebuild; `buildStagingDirectory "C:/b/t5"` MAX_PATH trick already in place). `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 1m 14s (25 executed, 505 up-to-date)
- APK size: 29868447 bytes (arm64-v8a release), copied to C:\apk\pd10-arm64-merged.apk
- APK sha256: f843f6f4da71020c37d96e956ea6f50fd100452d5b2b0d807537412abb2d6662. This is identical to the previous rerun's APK, so the bundled app code did not change in the merge (the explain additions are not part of the bundle reachable from the app entry); the run still proves the merged head builds and passes.
- Device: physical moto g73 5G (serial ZD22299HZT), arm64-v8a; installed with `adb install -r`; Metro not running; no other gradle or maestro session active at build or run start
- Command: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output ../../docs/test-reports/maestro-2026-10-30-pd10-rerun2.xml --test-output-dir C:/p/t5-out10` (from apps/mobile; all flows in .maestro, none from .maestro-pending)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 17s |
| onboarding-try-sample | PASS   | 14 s   |
| score-whatif          | PASS   | 29 s   |
| smoke                 | PASS   | 3 s    |

4/4 flows passed in 2m 3s on the first run, with no retries. No product code or flow was edited.
