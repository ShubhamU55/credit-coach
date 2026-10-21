---
name: maestro-android-e2e
description: How to write and run Maestro end-to-end flows for the Credit Coach Android app (apps/mobile) against a standalone release APK on Windows, including testID conventions and where to store reports. Use when adding or changing a mobile screen, writing a mobile E2E test, or verifying the demo path before submission.
---

# Maestro Android E2E (Credit Coach)

## Why a release APK
Judges' phones have no Metro dev server. Flows must pass against a **release-variant APK with Metro stopped**. A debug build that passes proves nothing about the demo.

## Run it
1. Start the emulator (Pixel_7). If adb shows `offline` or `authorizing` after a snapshot restore, kill it and cold-boot:
   ```bash
   "$ANDROID_HOME/emulator/emulator.exe" -avd Pixel_7 -no-snapshot -no-boot-anim -no-audio
   ```
   - **Second display:** the owner's Pixel_7 AVD defines `hw.display1`. Android may launch the app on that virtual display, and Maestro then sees a blank screen. Remove it for the session with `adb emu multidisplay del 1`.
   - **A System UI "not responding" dialog** can cover the app after a slow boot. If `maestro hierarchy` shows `android:id/aerr_wait`, tap Wait before running flows.
2. Build and install: `pnpm --filter @credit-coach/mobile android:release` (this runs `expo run:android --variant release`).
3. **Stop Metro or any dev server.**
4. Run: `pnpm --filter @credit-coach/mobile e2e`, which runs `maestro test .maestro`.

Maestro is installed at `%USERPROFILE%\.maestro\bin`. It needs Java 17 and `adb` on PATH.

## Writing flows
- Flows live in `apps/mobile/.maestro/<area>-<behaviour>.yaml`, one user journey per file. `smoke.yaml` must always pass.
- Always start with `launchApp: { clearState: true }` so each flow is independent.
- **Select by `testID`, not by visible text,** except when asserting copy the PRD fixes.
- **testID convention:** kebab-case and screen-prefixed: `dashboard-overall-util`, `planner-item-0-amount`, `onboarding-try-sample`.
- Assert the **values the engine computes** (amounts, utilization %, pay-by dates) using fixtures from the sample personas. The engine unit tests own the maths; flows prove it reaches the screen.
- Never type real PANs. Use the sample PANs and the on-screen demo OTP.

## Must-have flows before submission
1. `smoke.yaml`: the app launches.
2. `onboarding-try-sample.yaml`: one tap leads to a dashboard with a plan (PRD Goal 1, under 60 s).
3. `planner-mark-paid.yaml`: marking an item paid recomputes the plan.
4. `linking-demo-otp.yaml`: sample PAN, consent, on-screen OTP, accounts listed.
5. `predictor-range.yaml`: shows a range plus reasons, never a single score.

## Evidence for judges
- Store runs with `maestro test .maestro --format junit --output ../../docs/test-reports/maestro-<YYYY-MM-DD>.xml`, run from `apps/mobile` (where `.maestro/` lives), so the report lands in the repo-root `docs/test-reports/` that the CI evidence check (`.claude/hooks/bin/maestro-evidence.mjs`) reads. `<YYYY-MM-DD>` is the ISO date of the run, e.g. `maestro-2026-10-22.xml`.
- Keep a screen recording of the demo flow (`maestro record`) in `docs/test-reports/`.
- Mention both in the `/journal` entry.
