# Maestro run note: PD-8 Welcome and Home (feat/pd-8-welcome-home)

- Date: 2026-10-29
- Commit under test: 7857e03, built from a detached worktree at C:\p\t6
- Build: `expo prebuild --platform android`, `externalNativeBuild { cmake { buildStagingDirectory "C:/b/t6" } }` added in the `android { }` block of the generated android/app/build.gradle (MAX_PATH), then `.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 17m 27s
- APK size: 29839591 bytes (arm64-v8a release)
- APK sha256: 72454934133d4af53cae5acf786721a85c10fe51b1d6b5b136cce497f5d0ed43
- Device: physical moto g73 5G (serial ZD22299HZT), Android 14, ABI arm64-v8a, 1080x2400; `svc power stayon usb`; battery 40% on USB (41% after); Metro not running; APK installed with `adb install -r`
- Command: `maestro --device ZD22299HZT test .maestro --format junit --output docs/test-reports/maestro-2026-10-29-pd8-home.xml --test-output-dir <tmp>` (from apps/mobile; the 8 kit screenshots were copied into docs/test-reports/ui-kit/)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| kit-gallery           | PASS   | 1m 17s |
| onboarding-try-sample | PASS   | 14 s   |
| smoke                 | PASS   | 3 s    |

3/3 flows passed in 1m 34s on the first run, with no system dialog and no retries. onboarding-try-sample covers Welcome, Try sample, then Home. No product code or flow was edited.
