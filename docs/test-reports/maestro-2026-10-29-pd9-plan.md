# Maestro run note: PD-9 Plan and Mark as paid (feat/pd-9-plan)

- Date: 2026-10-29
- Commit under test: 6471c8c, built from a detached worktree at C:\p\t7
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t7" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 35m 7s
- APK size: 29868283 bytes (arm64-v8a release)
- APK sha256: 44ddeebfd9bf55aa9f2f6978784e959df00a3f6185c09c5b37b68dd8a1ddebc2
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, arm64-v8a; `svc power stayon usb`; battery 58% on USB (59% after); Metro not running
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd9-plan.xml --test-output-dir <tmp>` (from apps/mobile; the kit screenshots were copied into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 21s |
| onboarding-try-sample | PASS   | 15 s   |
| plan-mark-paid        | PASS   | 55 s   |
| smoke                 | PASS   | 4 s    |

4/4 flows passed in 2m 35s on the first run, with no system dialog and no retries. No product code or flow was edited.
