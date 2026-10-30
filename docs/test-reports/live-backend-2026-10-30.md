# Live backend check: AI-written text and the admin threshold (2026-10-30)

Manual, on the physical phone (moto g73 5G, arm64) against the live Supabase project `dchaubjxlkybebuoaetb`. Two throwaway Maestro flows drove the app; they are not committed and do not replace the committed flows. This is not a CI report, so it does not satisfy or affect the `maestro-evidence` check.

- App: `credit-coach-live-arm64.apk` (sha256 `80bebe42d39b85ac66973ea94d3d89172756ee06ef1573b13eb0ca5f8a1bc17e`), a fresh install with `clearState`. No rebuild between the two checks: both changes were server side.
- Function: `explain` deployed from `a84a219` (version 8), provider Gemini (`gemini-3.5-flash-lite`), secret `GEMINI_API_KEY` set by the owner. The Anthropic key was unusable (not scoped to a workspace), see the ruling in `docs/agent-runs/2026-10-30-pd-17-link.md`.
- Network: mobile data on, Wi-Fi off.

## 1. The Plan screen shows AI-written text

`04-verify.ps1` check 7d returned `source = ai` with a user (anonymous) session. On the phone, Try sample profile then Plan then scrolling to the explanation shows the label "WHY THIS PLAN · AI-WRITTEN" and a Gemini-worded paragraph (`plan-ai-written.png`). Every amount, date and percentage in it appears in the engine plan (₹620, ₹3,710, ₹11,780, ₹70,490, ₹2,400, 45.0% to 15.3%, 81.0% to 30.0%); the grounding check in the function and in the app would have shown the template otherwise. The estimate disclaimer sits directly below it.

First attempt of the flow failed only because it asserted the label before scrolling to the block; the second passed.

## 2. An admin rule change reaches the app

With the rule at 30 (the default), the Plan screen showed after-plan utilization 15.3%, highest card 81.0% to 30.0%, "Every card ends at or under 30%", and SBI SimplyClick ₹2,400. After the owner set the threshold to 20 in the admin (production build, signed in as the admin user) and the app was relaunched, it showed 11.3%, 81.0% to 20.0%, "Every card ends at or under 20%" and SBI SimplyClick ₹14,400 (`plan-threshold-20.png`). HDFC Millennia (₹74,200) and Axis Neo (₹12,400) did not change; they are full-statement payments either way.

The owner then set the rule back to 30, and a fresh launch confirmed it (15.3%, "under 30%", SBI SimplyClick ₹2,400, the same as the first reading). Check the admin shows 30 before any further demo that changes it.

## Not covered

- The AI sentence was not checked under threshold 20.
- Free-tier Gemini limits (429) and the intermittent 503 from the function's auth lookup were seen once (503) or not at all (429); either would show the template.
- The admin's dev server crashes on `/login` (Next.js invariant with `cacheComponents` and React `cache()` around `cookies()`); the production build works. Not fixed.
- Only arm64 libraries were exercised on a device.
