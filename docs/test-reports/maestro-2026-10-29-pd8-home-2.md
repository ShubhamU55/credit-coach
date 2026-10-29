# Maestro run note: PD-8 Welcome and Home, rerun (feat/pd-8-welcome-home)

- Date: 2026-10-29
- Commit under test: a22235b, built from a detached worktree at C:\p\t6
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t6" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 22m 13s
- APK size: 29846119 bytes (arm64-v8a release)
- APK sha256: 45d3578d30a2ffd55d4d4454bed46948de4a632a4d8178f88d572f4f98dcff0f
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, arm64-v8a; `svc power stayon usb`; battery 92% on USB (93% after); Metro not running
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd8-home-2.xml --test-output-dir <tmp>` (from apps/mobile; the kit screenshots were copied into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 30s |
| onboarding-try-sample | PASS   | 15 s   |
| smoke                 | PASS   | 3 s    |

3/3 flows passed in 1m 47s on the first run, with no system dialog and no retries. No product code or flow was edited. The earlier report (maestro-2026-10-29-pd8-home.xml, commit 25203a0) is kept.
