# Install guide for judges

How to get the Credit Coach Android app onto a phone, what to tap, and what does not work. Evidence for every
"we ran this" claim is in
[`docs/test-reports/final-apk-2026-10-30.md`](test-reports/final-apk-2026-10-30.md) and
[`docs/test-reports/maestro-2026-10-30-pd15-demo-path.md`](test-reports/maestro-2026-10-30-pd15-demo-path.md).

**Legend.** **[RAN]** means we executed it and the report above records it. **[NOT RAN]** means we wrote the step
from general Android knowledge and did not execute it, for example on a stock phone's settings screens.

## 1. What the APK is

- A standalone **release** APK (the JavaScript is bundled; no Metro server or network is needed).
- **All four ABIs** inside: arm64-v8a, armeabi-v7a, x86, x86_64.
- Size: **91,576,747 bytes** (about 87.3 MiB).
- sha256: `337a6a61fabbf3e65a87f22d855b3dd8599d32fad3093583a09287142cd4b7e4`
- Package: `com.creditcoach.app`.
- Signing: the generated Expo project signs the release variant with its default **debug keystore**. That is fine for
  sideloading. It is **not** a Play Store signing key, and the app is not on the Play Store.
- The APK is **not committed** to this repository (`*.apk` is git-ignored). The owner supplies it with the
  submission (a GitHub release or the submission form attachment).

### Verify the checksum

[NOT RAN as written below on the final file name; the expected value is from the build report]

```bash
# Windows (PowerShell or cmd)
certutil -hashfile credit-coach-release.apk SHA256
# macOS / Linux / Git Bash
sha256sum credit-coach-release.apk
```

The output must equal the sha256 above. If it does not, do not install the file.

## 2. Install on a phone

### Option A: sideload on a stock Android phone [NOT RAN on a stock phone UI]

The wording of the settings screens differs between vendors and Android versions, so treat these as a guide.

1. Copy `credit-coach-release.apk` to the phone (download it in the browser, or transfer by cable).
2. Open it from the browser's download list or from a file manager.
3. Android asks to allow installs from that app (the browser or the file manager). Allow it ("Install unknown
   apps" or "Allow from this source").
4. Confirm **Install**. Google Play Protect may warn that the app is from an unknown source or has not been scanned,
   because it is not from the Play Store and uses a debug key. That warning is expected. Choose to install anyway if
   you accept it.
5. Open **Credit Coach**.

### Option B: adb [RAN]

With USB debugging on and the phone connected:

```bash
adb install -r credit-coach-release.apk
adb shell monkey -p com.creditcoach.app -c android.intent.category.LAUNCHER 1
```

What we saw (moto g73 5G, Android 14, arm64): `adb install -r` printed Success. The `monkey` command launched the
app, the process was still running 12 seconds later, `MainActivity` was the resumed activity, and
`adb logcat -d | findstr FATAL` (after `logcat -c`) printed nothing.

## 3. What to tap

Everything uses a built-in sample profile (Aarav Mehta). No account, no demo OTP, no SMS, and **no network** are
needed. The app's "today" is fixed at **Wed 21 Oct 2026**, so dates on screen will not match the real date.

1. **Try sample profile** on the Welcome screen. Home opens.
2. **Home:** the headline, the one payment to make first, utilization 45.0%, and the estimated score range
   708 to 736 (an estimate, never one number).
3. **Plan:** tap **All 5 steps**. Five ordered steps, with the utilization before and after.
4. **Mark as paid:** on step 01 tap **Mark as paid**, choose **Minimum only**, and read the recorded amount
   (620 rupees).
5. **Score:** back on Home, tap the score tile for the range, the reasons and the what-ifs. Closing a card shows the
   credit-age and limit-loss warning.

[RAN] The Maestro flow `apps/mobile/.maestro/demo-path.yaml` taps exactly this path unaided from a fresh install
(Try sample, Home, Plan, Mark as paid, Score). It passed against this all-ABI APK on the phone in 1m 05s. A person
following the steps by hand on a stock phone is [NOT RAN].

## 4. Build from source

Needs Node 20 or newer, pnpm, JDK 17 and the Android SDK.

```bash
pnpm install --frozen-lockfile
pnpm --filter @credit-coach/mobile android:release   # standalone release build, installs on the running device
```

The final APK above was not built with that script. It was built with Gradle directly (commands recorded in the
reports). [RAN]:

```text
npx expo prebuild --platform android --clean
# then, from apps/mobile/android:
.\gradlew.bat app:assembleRelease -PreactNativeArchitectures=arm64-v8a    # arm64 only (the device evidence build)
.\gradlew.bat app:assembleRelease                                          # all four ABIs (the judge APK)
```

Build times seen:

- arm64 only, Gradle after a clean prebuild (prebuild time not recorded): **BUILD SUCCESSFUL in 8m 17s** (530 tasks, 502 executed). The APK was 29,899,003
  bytes.
- All four ABIs, run right after the arm64 build in the same checkout (warm cache): **BUILD SUCCESSFUL in 17m 7s**
  (566 tasks, 91 executed, 475 up-to-date). A cold all-ABI build was not timed and will take longer.

**Windows 260-character path limit.** The native build fails on long paths. We built from a short checkout (a
detached throwaway checkout at `C:\p\t5`) and, after `expo prebuild`, added this line to the generated
`android/app/build.gradle`:

```groovy
externalNativeBuild { cmake { buildStagingDirectory "C:/b/t5" } }
```

(the original failure and fix are in
[`docs/test-reports/maestro-2026-10-28-pd4-shell.md`](test-reports/maestro-2026-10-28-pd4-shell.md)). Because
`expo prebuild --clean` regenerates `android/`, the line has to be re-added after every clean prebuild. The generated
`android/` directory is not committed. Stop Metro and other Gradle or Maestro processes before building or running
flows.

## 5. Known limits, stated plainly

- **The AI explanation is not reachable.** The app does not sign in to Supabase and the `explain` Edge Function is
  not deployed, so "Why this plan?" shows the **template** explanation and no AI label. The app never depends on the
  LLM.
- **No consent flow yet**, no sign-up, no sign-in and no bureau link (PD-12 linking is not built).
- **Reminders (PD-13) are parked** on a branch and not in this APK. **The admin control center (PD-14) is not
  built.**
- **Only the arm64 libraries were exercised on a device.** The phone is arm64. The armeabi-v7a, x86 and x86_64
  libraries are in the APK but were not run on a device for this build (an earlier x86_64 release APK from PD-8 ran
  on an emulator).
- **Evidence is from one physical phone:** moto g73 5G, Android 14. Nothing here was tested on other devices or on
  a stock-UI phone.
- **The first full Maestro run on the final build was 4 of 6, and it passed 6 of 6 on rerun.** `demo-path` failed
  after the system swipe-up gesture sent the app home (seen in logcat) and `kit-gallery` failed an assertion that
  the screenshot suggests was satisfied. We suspect device gesture-navigation flakiness. The cause of the
  `kit-gallery` failure was **not proven**, and the retry was run differently (PowerShell directly, not `cmd /c`),
  so that difference is not ruled out. Details are in the Maestro report.
- **Estimates are calibrated to one sample fixture**, not fitted to real bureau data, and are always a range.
- **Release signing uses the debug key** (section 1).
