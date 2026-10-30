# 009: PD-6, release APK proof and the judge install guide

- **Date:** 2026-10-30
- **PRD refs:** section 9 (deliverables), section 5.1 (sample-profile path with no sign-up)
- **Plan:** `docs/parallel-streams.md`, ticket PD-6 (no separate plan file). The work was done on the PD-15 branch `feat/pd-15-hardening`, not on a `feat/pd-6-release-apk` branch.
- **Run ledger:** [`docs/agent-runs/2026-10-30-pd-15.md`](../agent-runs/2026-10-30-pd-15.md)
- **Evidence:** [`final-apk-2026-10-30.md`](../test-reports/final-apk-2026-10-30.md), [`maestro-2026-10-30-pd15-demo-path.md`](../test-reports/maestro-2026-10-30-pd15-demo-path.md)
- **Commits:** code under test `06187f0`; docs `54c4db0`, `19cfb40` and the install-guide commit that adds this entry

## Goal

Show that a standalone release APK builds and installs, and give judges a guide to install it, tap through the demo
path and know the limits. The ticket was meant to run early; it ended up being finished last, together with the
PD-15 hardening, because the screens it needed to cover were not merged until the end.

## What the AI did

- An evidence-runner agent built the APK in a short-path throwaway checkout (`C:\p\t5`), after a clean
  `expo prebuild`, with the Windows MAX_PATH workaround (`buildStagingDirectory "C:/b/t5"`) re-added to the generated
  Gradle file. arm64-only build: 8m 17s. It installed the app on a physical moto g73 5G and ran the six Maestro flows.
- **First full run: 4 of 6.** `demo-path` failed on an assertion and its screenshot was all black; the log showed the
  system swipe-up gesture sending the app home. `kit-gallery` failed an assertion although its screenshot showed the
  expected text. The runner kept the failed XML out of the repo, retried `demo-path` alone (passed), then the whole
  suite (6 of 6), and wrote the failure into the report instead of reporting only the clean run.
- Built the final **all-ABI** APK with plain `.\gradlew.bat app:assembleRelease`: 17m 7s on a warm cache. Recorded the size,
  sha256, the four ABIs found with `aapt2`, and ran `demo-path` against it (passed, 1m 05s).
- Read the built manifest with `aapt2 dump xmltree` and recorded the permissions and exported components.
- Wrote `docs/install.md` with each step marked as run or not run, then synced the README, `docs/submission.md` and the
  demo script to the merged state.

## Tests added

- No new tests in this ticket (docs only). The evidence is the Maestro runs above, using the existing flows and
  `demo-path.yaml` from PD-15.

## Review findings & fixes

- No reviewer ran on this ticket's docs. The PD-15 code changes had their own security pass, recorded in the PD-15
  ledger.

## Where AI was wrong / where I overrode it

- The first full Maestro run was 4 of 6. We suspect device gesture-navigation flakiness for `demo-path` (log evidence).
  For `kit-gallery` the cause was **not found**. The run also differed from the retries in how it was launched
  (`cmd /c` with redirected output, versus PowerShell directly), and that is not ruled out. So "flaky" is a
  classification, not a proven cause.
- The ticket text said the commands in the install guide must be executed by the author. The sideload steps through a
  stock phone's settings were not executed (only `adb install -r` and `monkey` launch were), so the guide marks them as not run.
- The APK ships signed with the generated debug key. That is stated in the guide; it is not a Play Store key.
- Only the arm64 libraries were run on a device. The other three ABIs are in the APK untested on this build.

## What I learned

- Run device evidence from the same launch method every time; the one difference between the failed run and the
  clean ones is something we cannot afford to leave open.
- On Windows, a clean `expo prebuild` regenerates `android/` and drops the MAX_PATH line, so the line must be
  re-added every time, and the build must come from a short checkout path.
- Record the failed run next to the passing one. It costs a paragraph and it is what makes the 6 of 6 believable.

## Time spent

Not tracked as a whole. Build times: arm64-only Gradle 8m 17s, all-ABI Gradle 17m 7s (warm cache); the six-flow Maestro
run 3m 40s.
