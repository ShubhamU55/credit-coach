# Credit Coach: Product Requirements Document

**Working name:** Credit Coach (rename freely)
**Owner:** Shubham Upadhyay (solo)
**Event:** Hack@FiftyFive "Build With AI" Hackathon 2026. Submit by **30 Oct 2026 EOD**. Evaluation 2–5 Nov. Results 6 Nov.
**Status:** **Frozen v1 (approved 21 Oct 2026).** Tech stack is decided separately in `docs/tech-stack.md`.

> Items tagged **[Call]** are decisions Claude made during brainstorming that the owner has not explicitly confirmed. Review those first.

---

## 1. Why this exists

People in India who hold several credit cards (often alongside FDs and loans) care about their CIBIL score but don't know **what to do this month** to protect or improve it. Existing apps (CRED, OneScore, Paisabazaar, bank apps) *show* a score and dues. Few tell you which card to pay, how much, and by when.

A little-known fact drives the product. The bureau sees the balance a lender **reports** at a reporting point. That point is typically the statement balance, and since 2026 there are also weekly snapshots. It is not what's left after you pay by the due date. Someone who pays in full every month can still show high utilization.

**Positioning:** *"Your credit coach: what to pay, where, and when, every month."* Tracking is the input; the **plan** is the product.

### Hackathon context that shapes everything
- **Judging weighs *how AI was used to build it*** as much as the product ("Show your thinking: problem, who it's for, what you built, how AI helped"). The AI-assisted process (specs, plans, tests, reviews, learnings) is a deliverable.
- **Solo, ~9 days.** A polished, reliable core beats many half-features.
- **Judges should be able to install and use it unaided.**

---

## 2. Goals, non-goals, anti-goals

**Goals**
1. A judge installs the Android APK, taps **"Try sample profile"**, and sees a concrete payment plan and estimated score range within **60 seconds**.
2. The core features in §5 work flawlessly on the demo path and are covered by automated tests.
3. The repo visibly demonstrates an AI-assisted engineering process (see §9).

**Non-goals (this hackathon)**
- iOS.
- Real bank linking, real Account Aggregator integration, or a production CIBIL integration.
- Executing payments. The app plans; the user pays in their bank app.
- Card marketplace, lending, or affiliate offers.

**Anti-goals (failure even if it "works")**
- Showing an **exact** score as if it were the user's real CIBIL score.
- Advising users to close cards without warning that closing an old card usually *hurts* the score.
- Storing a full PAN, or collecting real bank credentials.
- The demo breaking in a judge's hands: a dead backend, an SMS OTP they can't receive, or a sign-up wall.

---

## 3. Users

**Primary user:** an Indian adult with 1–5 credit cards, possibly FDs and loans/EMIs, who wants a good CIBIL score (e.g. for an upcoming home or car loan) and is willing to follow a monthly plan.

**Admin:** the product operator, who manages the catalog, rules and sample data that drive the app.

**Judge:** installs the APK on a stock Android phone with no guidance; may only watch the video.

---

## 4. Domain facts the product relies on

The builder and any agent working on this project must treat these as ground truth (researched 21 Oct 2026):

| # | Fact | Product implication |
|---|------|--------------------|
| F1 | Checking **your own** score is a **soft inquiry** and does not affect it, however often you check. Applying for a card or loan triggers a **hard inquiry**; several in a short span can cost points. | The predictor is pitched as "see the effect before the bureau does", not "checking hurts you". The application guard (§5.6) targets hard inquiries. |
| F2 | Since Jan 2025 lenders report at least fortnightly (15th and month-end). In 2026, RBI moved to **weekly** reporting: a full file by the 3rd, then increments on the 7th, 14th, 21st, 28th and month-end. Sources disagree on whether this started in Apr or Jul 2026; it is in effect now. | The planner must handle **reporting snapshot dates**, not only statement dates. |
| F3 | **Which balance** a card issuer reports at each weekly snapshot (statement balance or current outstanding) is **not confirmed**. | "Reporting basis" is a **configurable rule** (§5.4, §6). Default = statement balance. |
| F4 | Utilization: **under 30%** is the common guidance, and **lower (under 10%) is better**. Both per-card and overall utilization matter. | Threshold is configurable; default 30%, with 10% shown as "excellent". |
| F5 | There is **no public CIBIL API for individual developers**. Real pulls go through licensed partners (e.g. Surepass: CIBIL / multi-bureau APIs, sandbox advertised) and need business onboarding/KYC and money for production. A consumer-consented pull is a soft inquiry. | The bureau connector is swappable (§5.1). The demo provider is the default. |
| F6 | CIBIL's scoring model is proprietary (range 300–900). | The predictor shows a **range plus reasons**, never an exact score, and is always labelled an estimate. |
| F7 | Bureau reports contain accounts, limits, balances, open dates and payment history (DPD), but **not statement or due dates**. | After linking, the user must confirm the statement date and due date per card. |

---

## 5. Mobile app: Core requirements (must ship)

Android only. English only. Amounts in ₹ with Indian digit grouping (₹1,23,456).

### 5.1 Onboarding, sign-in and bureau linking
- **Sign-up / sign-in** for a personal account. The method is left to the builder, but it must not need SMS delivery for judges.
- **"Try sample profile"**: one tap on the first screen opens a fully populated sample persona with no sign-up. This is the judges' path.
- **Linking flow:** enter PAN + mobile → consent screen (what is fetched, why, retention) → OTP step → "Fetching your credit report…" → discovered accounts and score shown → user picks which accounts to add → user fills the missing fields (statement day, due day, current outstanding) per card.
  - **Demo OTP:** in demo mode the OTP is a fixed value **shown on screen** (e.g. `123456`).
- **Bureau connector with swappable providers** [Call]:
  1. **Demo provider (default):** returns realistic reports for the sample PANs managed in the admin panel. Must always work.
  2. **Surepass sandbox provider:** a bonus, only if the owner gets sandbox access in time.
  3. **Manual entry:** the last fallback (enter score + date + cards by hand).
- **Manual card management:** add, edit or remove a card (name/issuer, limit, current outstanding, last statement balance, statement day, due day, minimum due, and annual fee if known).
- **Privacy:**
  - The PAN is masked everywhere in the UI (e.g. `ABXXXXX34F`) and is never stored in full; the builder decides the storage approach.
  - Consent is recorded with a timestamp and purpose.

**Acceptance (examples)**
- *Given* a fresh install, *when* the judge taps "Try sample profile", *then* the dashboard with a plan appears without any typing.
- *Given* demo mode, *when* the user enters a sample PAN and the on-screen OTP, *then* the matching sample report's accounts are listed for selection.
- *Given* any screen, *then* no full PAN is visible.

### 5.2 Credit dashboard
- **Totals:** total limit, total outstanding, and **overall utilization** on a gauge with 30% and 10% markers.
- **Per card:** limit, outstanding, utilization % (colour-coded against the threshold), next statement date, next due date, minimum due.
- **"Next actions":** the top 3 items from the payment plan.
- **Estimated score range card:** links to §5.5.
- **Disclaimer footer:** "Estimates only. Not your official CIBIL score. Not financial advice."

**Acceptance:** utilization = outstanding ÷ limit, rounded to 1 decimal place. Overall = Σ outstanding ÷ Σ limit. A card with a limit of 0 or missing is excluded from utilization and flagged.

### 5.3 Payment planner (hero feature)
**Input:** the cash available to pay cards in the **next 30 days** (₹), plus the card data. **Output:** an ordered list of payment items. Each item shows the card, amount, **pay-by date**, reason, and utilization before → after.

**Payment tracking** [Call]:
- Each plan item has **"Mark as paid"** (full or partial amount). Marking it records a payment (card, amount, date) and lowers that card's outstanding.
- The plan is **recomputed** from the current state every time it is opened. It is not a frozen monthly object.
- Per card, the app tracks the **amount paid since the last statement**. From that it derives:
  - remaining statement balance = last statement balance − paid since statement (floored at 0)
  - **overdue** = the due date has passed and paid since statement < minimum due
- Recorded payments are the **payment history** for manual-entry users. For linked users, the bureau history (DPD) is the baseline and in-app payments are added to it. On-time vs missed payments feed the predictor (§5.5).
- Reminders for a card stop once its minimum (for due-date reminders) or its planned amount (for pre-payment reminders) is marked paid.

**Default allocation rules, in priority order** [Call: order and defaults are configurable via §6]:
1. **Overdue cards first:** pay at least the overdue minimum, immediately. Flag in red: "A missed payment is the most damaging event for your score."
2. **Minimum due on every card**, in order of earliest due date.
   - **If cash < sum of minimums:** fund minimums in due-date order until the cash runs out. Clearly show which cards will **miss** their minimum and the shortfall amount. Never hide a shortfall.
3. **Full statement balance** on each card to avoid interest, in order of highest interest rate (if known), then earliest due date.
4. **Utilization pre-payment:** spend the remaining cash on current outstanding, **before the next reporting point** (§5.4). The approach is greedy, by **per-card utilization in percentage points** [Call]:
   - (a) Repeatedly pay the card with the **highest utilization %** until it reaches the threshold, then the next-highest. When cash runs short, this lowers the **highest single card** first, because max per-card utilization is a predictor factor.
   - (b) Once every card is at or below the threshold, keep lowering cards toward the **10% "excellent" line**, highest % first, until the cash runs out.
   - Overall utilization follows from this; it is not a separate target.
5. Any leftover cash is shown as "Nothing more needed this cycle."

**Acceptance (examples, all must be automated tests)**
- Cash ≥ all minimums + statement balances + pre-payments needed → every card ends ≤ threshold and the plan says so.
- Cash < sum of minimums → the plan funds the earliest-due cards and lists the uncovered cards with their shortfall.
- An overdue card always appears first, whatever its due date.
- Changing the threshold (e.g. 30% → 20%) changes step-4 amounts accordingly.
- The plan never suggests paying more than a card's outstanding.
- The plan is deterministic: the same inputs always give the same output.

### 5.4 Reporting-date awareness
- For each card, compute the **next reporting point** using the configured **reporting basis** (§6). Each basis fixes both *when* the balance is reported and *which* balance is reported, because F3 is unconfirmed [Call]:
  - `statement` (default): reported **on the statement date**, with the **statement balance**. Step-4 pre-payments must land before the next statement date. Step-3 pay-by stays at the due date.
  - `weekly_current`: reported at the next of the 7th, 14th, 21st, 28th or month-end, with the **current outstanding**. Both step-3 and step-4 pay-by dates move to the earlier of (due date, next snapshot − buffer).
- Pay-by dates tied to a reporting point are **one day before** it. The buffer days are configurable.
- Both bases need planner tests. `statement` is the one the demo uses.
- The UI explains the reason in plain words: "Pay before 14 Nov so a lower balance gets reported."

### 5.5 Score impact predictor
- **Anchor:** the score and date from the last bureau fetch (or manual entry).
  - If there is no anchor, show only a **band** (e.g. "Good: 700–749") derived from in-app data, labelled "rough estimate".
- **Factors** (from app data): payment history (on-time vs missed), overall utilization, max per-card utilization, hard inquiries in the last 6/12 months, age of the oldest account, number of open accounts, and credit mix (secured vs unsecured).
- **Output:** an estimated **range** (low–high), clamped to 300–900, plus the **top 3 reasons** with direction arrows. Example: "▲ utilization 48% → 22%."
  - The range widens as time passes since the anchor.
- **What-if scenarios:**
  - pay ₹X on card Y
  - follow this month's plan
  - miss a payment
  - close card Y
  - apply for a new card or loan
  - open an FD-backed card
- **Rules engine with configurable weights** (§6). The starting weights are the builder's call but must be documented and adjustable from the admin panel. No ML model.
- **Re-check prompt:** a monthly nudge to re-fetch the real score so the anchor stays fresh. Self-checks don't hurt (F1).

**Acceptance (examples)**
- Lower utilization never produces a lower estimate than higher utilization, all else equal.
- Adding a missed payment never raises the estimate.
- "Close card Y" lowers the total limit and shows utilization rising, with a warning if Y is the oldest account.
- No screen ever shows a single exact predicted score.

### 5.6 Application guard
- Track hard inquiries from the bureau report, plus applications the user logs.
- Before a "new card / loan" what-if, or when the user logs an intended application, warn if there were ≥ N hard inquiries in the last 6 months (N is configurable, default 2). Show the estimated impact range.

### 5.7 Reminders
- Local push notifications for:
  - the pre-payment window (X days before the next reporting point)
  - the due date (3 days and 1 day before)
  - the monthly score re-check
- Offsets are configurable. The user can turn each type on or off.

### 5.8 Explanations (AI for words) [Call]
- The planner, predictor and guard are **deterministic rules** ("rules for the numbers").
- An LLM writes a short plain-English **"Why this plan?"** explanation **only from numbers the rules engine already computed**. It never computes or invents amounts, dates or scores.
- **Fallback:** if the AI service is unavailable or slow, show a template explanation. The app remains fully usable.

---

## 6. Admin control center (web)

**Priority:** built **after** the mobile core is green, if time allows. The repo, backend and test setup are prepared for it from day 1 either way.

**Admin contents** [Call: the owner deferred this question; review it]:
| Area | What the admin does | Feeds |
|------|--------------------|-------|
| **Coach rules** | Edit the utilization threshold (30%), the "excellent" line (10%), the reporting basis (`statement` / `weekly_current`), pay-by buffer days, planner step order, predictor factor weights, guard N, and reminder offsets | §5.3–5.7 |
| **Sample profiles** | Create and edit demo personas: masked PAN, mobile, score, accounts and payment history. These are what the demo bureau provider returns | §5.1 |
| **Card catalog** | Card products: issuer, name, annual fee, reward rates by category, interest rate | Next tier: better-card suggestions |
| **Subscription presets** | Netflix, Spotify, Prime, etc.: name, typical price, billing cycle | Next tier: subscriptions |
| **Users** | List users (masked), linked-card counts, last active. Read-only | — |
| **Audit log** | Who changed which rule and when | Trust and demo |

- **Admin auth:** a single admin role with a login. No self-sign-up.
- **Judge access (owner's decision):** if the admin panel is fully functional by submission, judges get admin credentials. If not, it stays owner-only (shown in the video) and is described in the submission as in-scope and planned. When judges have access [Call]:
  - Rules are **global**, not per judge. To protect the shared demo, add a **"Reset demo data"** button that restores default rules and sample profiles, plus an **automatic daily reset** during 2–5 Nov.
  - Validate rule inputs so they stay in sensible ranges (e.g. threshold 5–50%), so no single edit can break the app.
  - The README warns that edits affect all viewers. The audit log shows who changed what.
- **Demo moment:** change the threshold from 30% to 20% in the admin panel → refresh the app → the plan's pay-down amounts change.
- **Testing:** Playwright E2E for login, rule edit → audit entry, and sample-profile CRUD.

**At least 3 sample personas** [Call]:
1. **High-utilizer:** 3 cards, one at ~80%, overall ~45%, score ~720.
2. **Thin file:** 1 FD-backed card, short history, score ~690.
3. **Recovering:** 2 cards + 1 personal loan, one missed payment 4 months ago, 2 recent hard inquiries, score ~650.

---

## 7. Next tier (only after Core is green)

In this order unless re-prioritised:
1. **AI spending insights:** where spending concentrates across cards, by category, from transactions (sample transactions per persona + manual add). The LLM summarises numbers that were computed deterministically.
2. **Card advice:** underused cards → keep, upgrade or close. **Closing an old card shows a warning** about age and limit. Suggest better cards from the admin card catalog based on spending categories.
3. **Fixed deposits:** add FDs and show FD-backed card options for credit building.
4. **Loans/EMIs:** add loans; EMI due dates join the reminders and calendar; on-time EMIs feed the predictor.
5. **Subscriptions:** pick from admin presets and assign each to a card; show its monthly load on that card's utilization.

## 8. Future scope (pitch slide only)
- Real Account Aggregator integration, a licensed bureau partner in production, and automatic statement fetching.
- SMS/email parsing for transactions.
- Live card offers and custom-subscription compatibility checks.
- iOS. Bill payment deep-links.

---

## 9. Constraints and deliverables (stack-agnostic)

**Constraints for the tech-stack decision**
- The app and admin share live data, so a **hosted backend** is required. It must **stay up and free (or near-free) through 6 Nov**. Judges must not hit long cold starts or a dead service.
- The **APK installs on a stock Android phone** (sideload). The demo path needs no SMS, no Play Store, and no paid account.
- Secrets never live in the repo. The LLM key stays server-side.
- **Three test layers:**
  - unit tests for the rules engine (planner, predictor, guard) — the TDD target
  - mobile E2E (the tool is chosen with the stack; Maestro is the leading candidate)
  - **Playwright** for the admin panel
- Plus a security review pass before submission.
- Privacy follows the spirit of India's **DPDP Act**: consent, purpose limitation, masking, and minimal retention.

**Submission deliverables**
1. Android APK (e.g. attached to a GitHub release).
2. Demo video (3–5 min), recorded on a device or emulator. This is also the fallback if the APK fails.
3. Public repo with README, `docs/` (this PRD, the tech-stack decision, ADRs), test reports, and the **AI process journal**: per feature, spec → plan → tests → review → learnings, plus the reusable AI dev setup (agents, skills, rules and hooks, adapted from affaan-m/ECC with credit, plus custom ones).

**Dated plan with cut lines** (today = 21 Oct)
| Date | Milestone | Cut line |
|------|-----------|----------|
| 21 Oct | PRD frozen | — |
| 22–23 Oct | Tech stack decided; repo + AI dev foundation (domain skill, rules, test layers, CI) ready | Foundation must be done by 23 Oct |
| 24–27 Oct | Core §5.1–5.8 | Core complete and green by **27 Oct** |
| 28 Oct | Admin panel (thin) if core is green; otherwise Next-tier item 1 or polish | Admin is dropped first |
| 29 Oct | Hardening, security review, E2E, APK build, demo video | — |
| 30 Oct | Buffer + submission write-up | Submit by EOD |

---

## 10. Traceability to the original PRD

| Original PRD item | Where it lives now |
|---|---|
| Basic user login | Core §5.1 |
| Automated account linking via mobile/PAN | Core §5.1 (simulated, with swappable provider; real = Future) |
| Track multiple credit cards, balances, cycles, limits | Core §5.1, §5.2 |
| Fixed deposits | Next §7.3 |
| Loans and other debts | Next §7.4 |
| Transaction and statement fetching (AA / Open Banking / parsing) | Future §8 (sample transactions in Next §7.1) |
| Preset subscriptions (Spotify, Prime, Netflix) | Next §7.5, presets managed in Admin §6 |
| Custom subscription with compatibility checks | Future §8 |
| Spending pattern analysis | Next §7.1 |
| Underused cards → keep / upgrade / close | Next §7.2 |
| Better alternative cards | Next §7.2 (from admin catalog; live offers = Future) |
| Credit score simulator and strategies | Core §5.3–5.6 |
| Push notifications and alerts | Core §5.7 |
| *(new)* Admin control center | §6 |
| *(new)* Application guard, reporting-date awareness | Core §5.4, §5.6 |

Nothing from the original PRD was dropped; items were only re-tiered.

---

## 11. Left to the builder
- Tech stack, architecture and data model (next step, chosen against §9 constraints).
- UI design and visual style.
- Sign-in method (within the "no SMS for judges" constraint).
- Starting predictor weights and band boundaries (must be documented and admin-editable).
- PAN storage technique (within "never stored in full").
- Exact persona data beyond §6.
