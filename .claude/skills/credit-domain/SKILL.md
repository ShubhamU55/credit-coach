---
name: credit-domain
description: Credit Coach domain rules for India: CIBIL facts (soft vs hard inquiries, weekly bureau reporting), utilization maths, payment-planner priority order, reporting bases, score-predictor constraints and product anti-goals. Use before writing or reviewing any engine, planner, predictor, guard, reminder or copy that states a credit fact.
---

# Credit domain rules (Credit Coach)

The source of truth is `docs/PRD.md`. This skill condenses §4–§5 so agents don't have to re-derive them. If this skill and the PRD ever disagree, **the PRD wins**. Flag the drift.

## Ground-truth facts (PRD §4, researched 21 Oct 2026)

| # | Fact | Product implication |
|---|------|--------------------|
| F1 | Checking **your own** score is a **soft inquiry** and does not affect it, however often you check. Applying for a card or loan triggers a **hard inquiry**; several in a short span can cost points. | The predictor is pitched as "see the effect before the bureau does", not "checking hurts you". The application guard targets hard inquiries. |
| F2 | Since Jan 2025 lenders report at least fortnightly (15th and month-end). In 2026, RBI moved to **weekly** reporting: a full file by the 3rd, then increments on the 7th, 14th, 21st, 28th and month-end. Sources disagree on whether this started in Apr or Jul 2026; it is in effect now. | The planner must handle **reporting snapshot dates**, not only statement dates. |
| F3 | **Which balance** a card issuer reports at each weekly snapshot (statement balance or current outstanding) is **not confirmed**. | "Reporting basis" is a **configurable rule**. Default = statement balance. |
| F4 | Utilization: **under 30%** is the common guidance, and **lower (under 10%) is better**. Both per-card and overall utilization matter. | Threshold is configurable; default 30%, with 10% shown as "excellent". |
| F5 | There is **no public CIBIL API for individual developers**. Real pulls go through licensed partners (e.g. Surepass: CIBIL / multi-bureau APIs, sandbox advertised) and need business onboarding/KYC and money for production. A consumer-consented pull is a soft inquiry. | The bureau connector is swappable. The demo provider is the default. |
| F6 | CIBIL's scoring model is proprietary (range 300–900). | The predictor shows a **range plus reasons**, never an exact score, and is always labelled an estimate. |
| F7 | Bureau reports contain accounts, limits, balances, open dates and payment history (DPD), but **not statement or due dates**. | After linking, the user must confirm the statement date and due date per card. |

## Utilization (implemented in `packages/engine/src/utilization.ts`)
- **Per card:** `outstanding ÷ limit × 100`, rounded to 1 dp. Returns `null` if the limit is ≤ 0 or not finite. Such a card is excluded and flagged.
- **Overall:** `Σ outstanding ÷ Σ limit` over valid cards only, rounded to 1 dp. Returns `null` if no card is valid.

## Payment tracking (PRD §5.3)
- **"Mark as paid"** records a payment (card, amount, date) and lowers that card's outstanding.
- The plan is **recomputed** from the current state every time; it is never a frozen object.
- Remaining statement balance = `max(0, lastStatementBalance − paidSinceStatement)`.
- **Overdue** means: the due date has passed **and** `paidSinceStatement < minimumDue`.
- Recorded payments are the payment history for manual users. For linked users, bureau DPD is the baseline plus in-app payments.

## Planner priority order (PRD §5.3). Deterministic: same inputs, same output.
Input: cash available in the **next 30 days**, plus the card data. Output: ordered items, each with `{card, amount, payBy, reason, utilBefore, utilAfter}`.
1. **Overdue cards first.** Pay at least the overdue minimum, immediately, flagged red.
2. **Minimum due on every card**, earliest due date first. If cash is less than the sum of minimums, fund minimums in due-date order until cash runs out, and **list the uncovered cards and the shortfall**. Never hide a shortfall.
3. **Full statement balance** (avoids interest), highest interest rate first if known, then earliest due date.
4. **Utilization pre-payment** before the next reporting point. Greedy, by per-card utilization **in percentage points**:
   - (a) Pay the card with the highest utilization % down to the threshold, then the next-highest, and so on.
   - (b) **Only if the "Aim for 10% utilization" switch is on** (off by default; PRD v1.1): once every card is at or below the threshold, lower cards toward **10%**, highest first. With the switch off, stop at the threshold and report the rest as left over.
   - Overall utilization follows from this; it is not a separate target.
5. Leftover cash: "Nothing more needed this cycle."
- **Never** pay more than a card's outstanding.

## Reporting bases (PRD §5.4). Each basis fixes *when* and *which* balance is reported.
- **`statement`** (default and demo): reported on the **statement date** with the **statement balance**. Step-4 pay-by is before the next statement date; step-3 pay-by is the due date.
- **`weekly_current`**: reported on the next of the **7th, 14th, 21st, 28th or month-end** with the **current outstanding**. Step-3 and step-4 pay-by = the earlier of (due date, next snapshot − buffer).
- Pay-by tied to a reporting point = **1 day before it** (the buffer is configurable).

## Score predictor (PRD §5.5)
- **Anchor:** the last bureau score and its date. With no anchor, show only a band (e.g. "Good: 700–749"), labelled "rough estimate".
- **Factors:**
  - on-time vs missed payments
  - overall utilization
  - max per-card utilization
  - hard inquiries in the last 6/12 months
  - age of the oldest account
  - number of open accounts
  - credit mix (secured vs unsecured)
- **Output:** `{low, high}` clamped to **300–900**, plus the **top 3 reasons** with direction. The range **widens** as time passes since the anchor.
- **Monotonicity (must be tested):**
  - lower utilization never lowers the estimate
  - a missed payment never raises it
  - closing a card lowers the total limit, so utilization rises; warn if it's the oldest account
- Weights are a configurable rules table, admin-editable. **No ML.**

## Application guard (PRD §5.6)
- Warn if there were **≥ N hard inquiries in the last 6 months** (N defaults to 2) before a "new card or loan" what-if or a logged application. Show the estimated impact range.

## Anti-goals (never ship these)
- An exact predicted score presented as the real CIBIL score.
- Advice to close a card without warning about credit age and limit.
- Storing or logging a full PAN, or collecting bank credentials.
- A demo that needs SMS, sign-up or a live backend to show the core plan.
- Letting the LLM compute amounts, dates or scores. It only words engine output.

## Money and dates in code
- **Amounts:** integer paise or rupees. Plan 2 decides which, and must use it everywhere. Never floats for currency arithmetic.
- **Dates:** pass `today` into every engine function. Use calendar dates (no time zone drift). "Month-end" means the last calendar day.
- **Display:** Indian digit grouping (₹1,23,456).
