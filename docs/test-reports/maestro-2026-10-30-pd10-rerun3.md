# Maestro run note: PD-10 Score and What-if, rerun 3 on the head merged with PD-9 (feat/pd-10-score)

- Date: 2026-10-30
- Commit under test: b9aef32 (merge of main, which brought in PD-9's Plan and Mark as paid screens (#68), into the PD-10 branch), built from the detached worktree C:\p\t5
- Build: incremental, not clean. The generated android/ dir was reused (apps/mobile package.json and app.json unchanged since the previous build, so no prebuild; `buildStagingDirectory "C:/b/t5"` MAX_PATH trick already in place). `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 1m 13s (25 executed, 505 up-to-date)
- APK size: 29898507 bytes (arm64-v8a release), copied to C:\apk\pd10-arm64-merged2.apk
- APK sha256: 00a28bd52ab39c4538dd4120515d35b34d15cafb94240ed16d0cf2ac1065dab3 (differs from rerun2's f843f6f4..., as expected: the bundle now includes PD-9's screens)
- Device: physical moto g73 5G (serial ZD22299HZT), arm64-v8a; installed with `adb install -r`; Metro not running; no other gradle or maestro session active at build or run start; C: had 24.7 GB free
- Command: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output ../../docs/test-reports/maestro-2026-10-30-pd10-rerun3.xml --test-output-dir C:/p/t5-out11` (from apps/mobile; all flows in .maestro, none from .maestro-pending)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 15s |
| onboarding-try-sample | PASS   | 13 s   |
| plan-mark-paid        | PASS   | 49 s   |
| score-whatif          | PASS   | 31 s   |
| smoke                 | PASS   | 3 s    |

5/5 flows passed in 2m 52s on the first run, with no retries. No product code or flow was edited. docs/test-reports/ui-kit/*.png were regenerated but are byte-identical to the committed ones (git shows no change), so none are included.
