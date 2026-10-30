# Maestro run note and manifest check: merged mobile batch, OFFLINE build (feat/pd-17-app-backend)

- Date: 2026-10-30
- Commit under test: f5edf47 (merge of feat/pd-17-polish into the app-backend link branch; includes 5036bdc Plan AI text). Built from the detached throwaway checkout C:\p\t5 at f5edf47.
- Build variant: OFFLINE. No apps/mobile/.env exists, so `EXPO_PUBLIC_SUPABASE_*` are empty and the backend is disabled; the app must behave like the main build. A second build with env is to follow.
- Prebuild decision: NOT re-run. `git diff 9510516 f5edf47 -- apps/mobile/package.json apps/mobile/app.json` shows only `@supabase/supabase-js` and `react-native-url-polyfill` added (both JS-only) plus a reorder of expo-font/expo-constants; app.json is unchanged. The generated android/ dir and its `buildStagingDirectory "C:/b/t5"` line were kept. `pnpm install --frozen-lockfile` ran first.
- Build: `.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a`, BUILD SUCCESSFUL in 5m 8s (incremental: 530 tasks, 58 executed, 472 up-to-date).
- APK: C:\apk\pd17-arm64-offline.apk (not committed), 30481431 bytes, sha256 c563b6ba31394b63ddb43da9a67896018efeaf9aa7af6c5abda8bb542da540a6. C:\apk\credit-coach-release.apk (submission fallback) was not touched.
- Device: physical moto g73 5G (serial ZD22299HZT, arm64-v8a). App uninstalled, then fresh `adb install` (firstInstallTime equals lastUpdateTime, 11:18:02). Metro not running. No other gradle or maestro process at build or run start. C: had about 20 GB free.
- Command (from apps/mobile): `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 maestro --device ZD22299HZT test .maestro --format junit --output ..\..\docs\test-reports\maestro-2026-10-30-pd17-offline.xml --test-output-dir C:\p\pd17-out4`. All six flows in .maestro, none from .maestro-pending. No flow or product code edited.

## Results (committed .xml is the clean 6/6 run, gesture navigation)

| Flow                  | Result | Time   |
| --------------------- | ------ | ------ |
| demo-path             | PASS   | 1m 4s  |
| kit-gallery           | PASS   | 1m 15s |
| onboarding-try-sample | PASS   | 15 s   |
| plan-mark-paid        | PASS   | 49 s   |
| score-whatif          | PASS   | 32 s   |
| smoke                 | PASS   | 3 s    |

6/6 passed in 3m 58s.

## Offline proof

Wi-Fi and mobile data were disabled (`svc wifi disable`, `svc data disable`). `adb shell ping 8.8.8.8` returned "connect: Network is unreachable" (only IMS-only cellular agents remained in dumpsys connectivity, which carry no general internet). `demo-path.yaml` then PASSED in 1m 9s (junit: maestro-2026-10-30-pd17-offline-demo-path.xml). Wi-Fi and data were re-enabled afterwards; ping to 8.8.8.8 works again.

## Honest notes: the first full run failed because of 3-button navigation

I switched the phone to 3-button navigation as suggested (`cmd overlay enable com.android.internal.systemui.navbar.threebutton`). The first full run went 4/6: `demo-path` and `plan-mark-paid` failed at `extendedWaitUntil/assertVisible id: mark-paid-recorded` (screenshots C:\p\pd17-out1\2026-10-30_111839\plan-mark-paid\screenshots\step-020-assertCondition-mark-paid-recorded.png and C:\p\pd17-out2\2026-10-30_112318\demo-path\screenshots\step-019-assertCondition-mark-paid-recorded.png). Both show the phone launcher, i.e. the app was sent home after the `mark-paid-confirm` tap; a repeat of demo-path alone failed the same way, so it is deterministic under 3-button nav. In the plan screenshot the three nav-bar buttons are drawn over the bottom of the app (over the tab bar and the content). No FATAL or crash entry appears in logcat; the likely cause is the confirm tap landing on the Back button of the nav bar. This is a hypothesis: I did not prove which coordinate was tapped. After restoring gesture navigation (`cmd overlay enable ...navbar.gestural`, navigation_mode back to 2) demo-path passed alone and then all six flows passed on the first run in that mode. Possible product follow-up for the owner: under 3-button navigation the sheet confirm button or bottom content may sit under the system nav bar (an insets issue); the judge phones may use either mode. The phone was left on gesture navigation, as found. The failed 3-button xml was overwritten by the clean run and is not kept. No flaky retries were needed in gesture mode.

## Manifest check (aapt2 dump xmltree and dump permissions on the built APK)

- `android:allowBackup`: **false**
- targetSdkVersion 36
- `uses-permission`: `android.permission.INTERNET` (already present before this batch, no change), `android.permission.VIBRATE`, and the app-private `com.creditcoach.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (AndroidX). Nothing new added by the Supabase/polyfill dependencies.
- Exported components: two `exported=true` and two `false`, same count as the PD-15 report (MainActivity and the AndroidX ProfileInstallReceiver exported).
