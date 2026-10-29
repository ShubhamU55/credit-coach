# Maestro run note: PD-5 backend rerun (feat/pd-5-backend)

- Date: 2026-10-30
- Commit under test: 6b2c1f5 (built from the detached worktree at C:\p\t5 because of the Windows MAX_PATH limit; last apps/mobile commit is 6a6cc73). main's PD-8 Welcome/Home screens are merged in, so the flows include PD-8's updated onboarding-try-sample.yaml and smoke.yaml.
- Build: `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a` (release variant, arm64 only) with the throwaway `buildStagingDirectory "C:/b/t5"` in the generated android/app/build.gradle (never committed). BUILD SUCCESSFUL in 4m 41s (warm cache, 530 tasks, 37 executed, 493 up-to-date). No prebuild re-run was needed (no change to package.json, app.json or the lockfile since the last build).
- APK: copied to C:\apk\pd5-arm64-rerun.apk
- APK size: 29846119 bytes
- APK sha256: 4642c9983a670e59f6b8b9c85878ac37a678c56935c50f357051dce8210255d9
- Device: physical Motorola moto g73 5G, serial ZD22299HZT, arm64, installed with `adb install -r`
- Metro: not running (port 8081 free); release APK uses bundled JS
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output ../../docs/test-reports/maestro-2026-10-30-pd5-rerun.xml` (from apps/mobile, with `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000`)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 18s |
| onboarding-try-sample | PASS   | 14 s   |
| smoke                 | PASS   | 3 s    |

3/3 flows passed in 1m 35s. No flow or product code was edited.

## Honest notes

- Maestro started its driver on the first attempt this time; no retries and no aerr_wait dialog.
- No other gradlew or maestro process was running before the build or the Maestro run.
- The Supabase explain function is NOT deployed, so the app shows the deterministic template explanation; these flows do not exercise the LLM path.
- This report supersedes maestro-2026-10-30-pd5-backend.md, which ran on 37427e8 before PD-8 merged.
