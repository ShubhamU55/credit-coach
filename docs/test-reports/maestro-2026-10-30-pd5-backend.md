# Maestro run note: PD-5 backend (feat/pd-5-backend)

- Date: 2026-10-30
- Commit under test: 37427e8 (built from a detached worktree at C:\p\t5 because of the Windows MAX_PATH limit; last apps/mobile commit is 74aa53a)
- Build: `npx expo prebuild --platform android`, then `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a` (release variant, arm64 only) with `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t5" } }` added to the generated android/app/build.gradle (throwaway, never committed). BUILD SUCCESSFUL in 21m 50s (530 tasks executed, cold cache)
- APK: apps/mobile/android/app/build/outputs/apk/release/app-release.apk, copied to C:\apk\pd5-arm64.apk
- APK size: 29494831 bytes
- APK sha256: d5fa050ad7a152f5181a6e3e98c55b2187f539f7420e146f59959e0fe404ec17
- Device: physical Motorola moto g73 5G, serial ZD22299HZT, arm64, Android 14, installed with `adb install -r`
- Tools: Maestro 2.11.0, OpenJDK 17, Node v24.16.0, pnpm 12.14.0
- Metro: not running (port 8081 free); release APK uses bundled JS
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-30-pd5-backend.xml` (from apps/mobile, with `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000`)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 17s |
| onboarding-try-sample | PASS   | 24 s   |
| smoke                 | PASS   | 3 s    |

3/3 flows passed in 1m 45s. No flow or product code was edited.

## Honest notes

- This PR's mobile change is only the `src/explain` grounding. The Supabase explain function is NOT deployed, so the app shows the deterministic template explanation. These flows prove the release APK still launches and the demo path works; they do not exercise the LLM path.
- The first two `maestro test` attempts failed on every flow with `DeviceServerDiedException` / "driver did not start in time". This was a Maestro driver startup problem on the physical phone (the phone also has a second user, "Vault Profile", id 10), not an app failure. The driver apps were uninstalled and Maestro re-run with `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000`; the same installed APK then passed all flows unchanged.
- Maestro's smoke flow passed against the current app, so main's flows are not stale for this branch.
