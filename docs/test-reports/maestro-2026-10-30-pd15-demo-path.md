# Maestro run note and manifest check: PD-15 hardening and the full demo path (feat/pd-15-hardening)

- Date: 2026-10-30
- Commit under test: 06187f0 (code: 0db3192 app.json hardening and seed PAN check, 5ddd78f new `apps/mobile/.maestro/demo-path.yaml`; later commits are docs only). Built from the detached throwaway checkout C:\p\t5.
- Build: clean `npx expo prebuild --platform android --clean` (app.json changed), then the `buildStagingDirectory "C:/b/t5"` MAX_PATH trick in the generated `android/app/build.gradle`, then `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. BUILD SUCCESSFUL in 8m 17s (530 tasks, 502 executed).
- APK: C:\apk\pd15-arm64.apk, 29899003 bytes (arm64-v8a only), sha256 a5b4c4d4ae5a6d91968fcda318ed626eb66c817b4a8e2dc8dd654fd3819c6d83
- Device: physical moto g73 5G (serial ZD22299HZT, arm64-v8a, 1080x2400, font scale 1.0). The app was uninstalled first (`adb uninstall com.creditcoach.app`, Success) and then installed fresh with `adb install` (firstInstallTime equals lastUpdateTime, 02:18:05). Metro not running (port 8081 free). No other gradle or maestro process active at build or run start. C: had 25 GB free at build.
- Command (from apps/mobile): `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output ..\..\docs\test-reports\maestro-2026-10-30-pd15-demo-path.xml --test-output-dir C:\p\pd15-out3` (all six flows in .maestro, none from .maestro-pending). No flow or product code was edited.

## Results (the committed .xml is the clean 6/6 run)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| demo-path             | PASS   | 53 s   |
| kit-gallery           | PASS   | 1m 14s |
| onboarding-try-sample | PASS   | 14 s   |
| plan-mark-paid        | PASS   | 46 s   |
| score-whatif          | PASS   | 30 s   |
| smoke                 | PASS   | 3 s    |

6/6 passed in 3m 40s.

## Honest notes: the first full run was not clean

The first full run on the same installed APK (output dir C:\p\pd15-out1) went 4/6: `demo-path` failed (assertion `id: mark-paid-amount, text: ₹620` not visible, screenshot C:\p\pd15-out1\2026-10-30_021818\demo-path\screenshots\step-017-assertCondition-₹620.png, which is an all-black screen) and `kit-gallery` failed (assertion `id: kit-range-xl, text: 708–736` not visible, although the screenshot shows 708–736 on screen). Evidence for the demo-path failure: at 02:19:13 the device logcat shows `Gesture Monitor swipe-up (server) is stealing touch` and a TO_FRONT of the home task, so the system swipe-up navigation gesture sent the app home, and the app then showed a black screen while it restarted. The device was also slow during that run (queueBuffer fps between 0.9 and 21). No crash, ANR or JS error appears in the logcat. The kit-gallery failure has no such gesture in its log and I could not determine a cause. Both flows passed on retry: demo-path alone in 1m 01s, then the whole suite again (the table above). I classify the first-run failures as device and gesture flakiness, not product regressions, but I did not prove that for kit-gallery. That run was launched through `cmd /c` with output redirected, and the retries through PowerShell directly; I can't rule that difference out. The failed first-run xml was not committed (kept at C:\p\pd15-run1-failed.xml).

## Manifest check (aapt2 dump xmltree on the built APK; source manifest in the generated android/app/src/main/AndroidManifest.xml agrees)

- `android:allowBackup`: **false** (good)
- targetSdkVersion 36
- `<uses-permission>` in the final APK: `android.permission.INTERNET`, `android.permission.VIBRATE`, and the app-private `com.creditcoach.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX, own signature-level permission, not a dangerous permission).
- Absent as required: READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW (the source manifest removes them with `tools:node="remove"`).
- `usesCleartextTraffic`: not set in the merged manifest. At targetSdk 36 the platform default is cleartext not permitted.
- Exported components (`android:exported=true`):
  - `com.creditcoach.app.MainActivity` (the launcher activity; also a VIEW/BROWSABLE filter for the `creditcoach://` scheme)
  - `androidx.profileinstaller.ProfileInstallReceiver` (AndroidX library receiver, protected by `android.permission.DUMP`, so only shell or system can call it)
- Not exported (`false`): `expo.modules.filesystem.FileSystemFileProvider` (grantUriPermissions=true) and `androidx.startup.InitializationProvider`. No services declared.
