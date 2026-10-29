# Maestro run note: PD-10 Score and what-ifs (feat/pd-10-score)

- Date: 2026-10-29
- Commit under test: 020a88c, built from a detached worktree at C:\p\t8
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t8" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 22m 40s
- APK size: 29861515 bytes (arm64-v8a release)
- APK sha256: 977f7137d6d308750d0052b2af23af9ce55e5ad221a46d61718d03ec1067d8d7
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, arm64-v8a; `svc power stayon usb`; battery 82% on USB (82% after); Metro not running
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd10-score.xml --test-output-dir <tmp>` (from apps/mobile; the kit screenshots were copied into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 21s |
| onboarding-try-sample | PASS   | 14 s   |
| score-whatif          | PASS   | 25 s   |
| smoke                 | PASS   | 3 s    |

4/4 flows passed in 2m 4s on the first run, with no system dialog and no retries. No product code or flow was edited.
