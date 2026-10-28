# Parallel build streams (28 to 30 Oct)

How to build the product in parallel Claude Code sessions with as few interruptions as possible. Written 2026-10-28. Submission is **30 Oct 2026 EOD**. Tickets are on the [project board](https://github.com/users/ShubhamU55/projects/1) as `PD-1` to `PD-16` (Plan = "Product").

## Reality check

- PRD §9 planned "Core §5.1 to §5.8 complete and green by 27 Oct". Today the product is: engine = `utilization` + formatters; mobile = bare Expo `App.tsx`; admin = stock Next scaffold; `supabase/` = `config.toml`. The agentic dev system (Plan 1c) took the time. Do not pretend otherwise in the submission; the journal already tells that story.
- Cut line from PRD §9, applied: **the admin panel is cut first**, then reminders and the bureau-linking flow. The judges' path (sample profile, dashboard, plan, mark as paid, score) is **P0** and must work unaided (CLAUDE.md non-negotiable 8).
- Priorities: **P0** = PD-1 to PD-4, PD-7 to PD-10, PD-14 to PD-16. **P1** = PD-5, PD-6, PD-11. **P2 (cut first)** = PD-12, PD-13.
- Parallel sessions share one Claude account's usage limits. A rate or spend limit already interrupted a Plan 1c session once. **Run at most 4 sessions at a time**, in the start order given below, and start the next one as a session finishes.

## The golden target everyone builds against

`docs/design.md` section 8 ("Sample profile: Aarav") gives exact cards and the exact expected plan (today = Wed 21 Oct 2026, cash = ₹1,20,000, threshold 30%, 10% switch on or off). It is the acceptance test for the planner, the predictor and every screen. The seed data source it points to is `.design/credit-coach/INFORMATION_ARCHITECTURE.md` ("Canonical sample data"); if the two disagree, that file wins.

## Streams, ownership and dependencies

Each stream owns a disjoint set of files. Nobody edits another stream's files, `CLAUDE.md`, `README.md`, `docs/status.md`, `.claude/**` or `.github/**`.

| Ticket | Stream                                                                                     | Owns (writes only here)                                                            | Starts                                  | Needs merged first               |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- |
| PD-1   | Engine: types, reporting dates, planner (PRD §5.3, §5.4)                                   | `packages/engine/src/{types,reporting,planner}*.ts` and their tests                | now                                     | none                             |
| PD-2   | Engine: predictor, what-ifs, guard (PRD §5.5, §5.6)                                        | `packages/engine/src/{predictor,whatif,guard}*.ts` and their tests                 | now                                     | none (own primitive input types) |
| PD-3   | Kit A: harness, tokens, primitives, buttons, forms (Plan 4a tasks 1, 3, 4, 5)              | `apps/mobile/src/kit/**` (tasks 1,3,4,5), jest config                              | now                                     | none                             |
| PD-4   | App shell: routes, demo repository, Aarav data                                             | `apps/mobile/src/{app,state,demo}/**`, `apps/mobile/app/**` or the router's folder | now                                     | none                             |
| PD-5   | Supabase: schema, RLS, seeds, `explain` function                                           | `supabase/**`                                                                      | now                                     | none (needs Docker running)      |
| PD-6   | Release APK proof and install guide                                                        | `docs/install.md`, `docs/test-reports/**`                                          | now                                     | none                             |
| PD-7   | Kit B: info blocks, cards, plan and score visuals, chrome, gallery (Plan 4a tasks 6 to 11) | `apps/mobile/src/kit/**` (tasks 6 to 11)                                           | when PD-3's first PR (task 1) is merged | PD-3 task 1                      |
| PD-8   | Screens: Welcome + Home (PRD §5.1 sample path, §5.2)                                       | `apps/mobile/src/screens/{welcome,home}/**`                                        | wave 2                                  | PD-1, PD-4, PD-7                 |
| PD-9   | Screens: Plan + Mark as paid (PRD §5.3)                                                    | `apps/mobile/src/screens/plan/**`                                                  | wave 2                                  | PD-1, PD-4, PD-7                 |
| PD-10  | Screens: Score + what-ifs + guard (PRD §5.5, §5.6)                                         | `apps/mobile/src/screens/score/**`                                                 | wave 2                                  | PD-2, PD-4, PD-7                 |
| PD-11  | Explanations: "Why this plan?" with template fallback (PRD §5.8)                           | `apps/mobile/src/explain/**`, `packages/engine/src/explain*.ts`                    | wave 2                                  | PD-1, PD-4 (PD-5 only to deploy) |
| PD-12  | Bureau linking flow with demo provider (PRD §5.1)                                          | `apps/mobile/src/screens/link/**`                                                  | wave 3                                  | PD-4, PD-7                       |
| PD-13  | Reminders: local notifications (PRD §5.7)                                                  | `apps/mobile/src/reminders/**`                                                     | wave 3                                  | PD-1, PD-4                       |
| PD-14  | Admin control center, thin (PRD §6)                                                        | `apps/admin/**`                                                                    | wave 3                                  | PD-5 deployed (cut first)        |
| PD-15  | Hardening: Maestro demo path, security review, final APK                                   | `apps/mobile/.maestro/**`, `docs/test-reports/**`                                  | wave 3                                  | PD-8 to PD-10                    |
| PD-16  | Submission: video script, README run section, journal, test reports (PRD §9)               | `docs/**` (not owned by others)                                                    | wave 3                                  | everything P0                    |

Issue numbers: `PD-n` is issue **#(37 + n)** (PD-1 is #38, PD-8 is #45, PD-16 is #53). Pass it as the third argument to `scripts/pm/open-pr.sh` so the PR closes its ticket.

**Shared hotspots and how to resolve them**

- `packages/engine/src/index.ts`: PD-1, PD-2 and PD-11 each append their own `export` lines. On a conflict keep both sides.
- `pnpm-lock.yaml` and each workspace `package.json`: add dependencies only to your own workspace (`npx expo install <pkg>` inside `apps/mobile`, `pnpm --filter <name> add` elsewhere). On a lockfile conflict: `git checkout origin/main -- pnpm-lock.yaml && pnpm install`, then continue.
- `docs/status.md` is owned by nobody in this phase. Each stream writes its handoff in its run ledger `docs/agent-runs/2026-10-28-<ticket>.md` (CLAUDE.md parallel-wave exception). The owner (or PD-16) folds them into `docs/status.md` at the end.
- Journal numbers are pre-assigned so parallel streams never collide: PD-1 `004`, PD-2 `005`, PD-3 `006`, PD-4 `007`, PD-5 `008`, PD-6 `009`, PD-7 `010`, PD-8 `011`, PD-9 `012`, PD-10 `013`, PD-11 `014`, PD-12 `015`, PD-13 `016`, PD-14 `017`, PD-15 `018`, PD-16 `019`. File name `docs/journal/<NNN>-<ticket>-<slug>.md`.

## Start order (max 4 at once)

1. **Now:** PD-1, PD-3, PD-4, PD-2. (PD-3 must open its task-1 pull request first and fast; PD-7 waits for it.)
2. **As soon as one of those finishes:** PD-5, then PD-7 (once PD-3's task-1 PR is merged), then PD-6.
3. **Wave 2** when its "needs merged" column is satisfied: PD-8, PD-9, PD-10, PD-11.
4. **Wave 3:** PD-15 and PD-16 are mandatory; PD-12, PD-13, PD-14 only if time remains.

Run one session per ticket. Open each in its own worktree so sessions never touch the same checkout:

```powershell
cd C:\Users\55\credit-coach
git fetch origin
git worktree add ..\cc-pd1 -b feat/pd-1-planner origin/main
cd ..\cc-pd1
pnpm install --frozen-lockfile
claude
```

Then paste the **common preamble** and the **ticket prompt** into that session (both are below). Branch names: `feat/pd-1-planner`, `feat/pd-2-predictor`, `feat/pd-3-kit-a`, `feat/pd-4-app-shell`, `feat/pd-5-backend`, `feat/pd-6-release-apk`, and `feat/pd-<n>-<slug>` for the rest.

## Merging without waiting

Sessions open PRs with `scripts/pm/open-pr.sh` (it pushes as `ShubhamU55`, never switches your default account, and does not merge). Merges stay yours, because the harness refuses agent-run merges. To avoid sitting on green PRs, run this once in PowerShell whenever PRs are open; GitHub then merges each one by itself the moment its required checks are green:

```powershell
$env:GH_TOKEN = gh auth token --user ShubhamU55
gh pr list --repo ShubhamU55/credit-coach --state open --json number --jq '.[].number' |
  ForEach-Object { gh pr merge $_ --repo ShubhamU55/credit-coach --squash --delete-branch --auto }
Remove-Item Env:GH_TOKEN
```

If a PR reports a conflict, tell that session; it rebases onto `origin/main` and pushes again. Review the diff of anything touching `.claude/**`, `supabase/**` or secrets before it merges (`--auto` does not skip your reading).

## Common preamble (paste first, in every session)

```text
You are one of several parallel Claude Code sessions building the Credit Coach hackathon product. Submission is 30 Oct 2026 EOD, so speed with discipline matters. You own exactly ONE ticket (named in the ticket prompt that follows).

READ FIRST, in this order: CLAUDE.md; docs/parallel-streams.md (this plan: your ticket's row, file ownership, hotspot rules); the PRD sections your ticket names in docs/PRD.md; the credit-domain skill (F1-F7 facts, planner order, anti-goals); docs/design.md for anything visual (section 8 is the golden "Aarav" fixture); docs/tech-stack.md; and the framework notes in apps/mobile/AGENTS.md or apps/admin/AGENTS.md before using any Expo or Next API.

OWNER PRE-APPROVAL (this overrides the usual "stop for plan approval" step): the owner has approved this ticket's scope as written in docs/parallel-streams.md. Do NOT stop to ask for plan approval and do NOT ask questions you can answer yourself. Decide, write the decision in your run ledger as "Ruling: <what> - <why> - <cost if wrong>", and keep going. Stop only for: an irreversible or destructive action, a security-sensitive action, a side effect outside your worktree that normally needs a human (a merge, a deploy, a secret), or a plan so broken that every path is a guess.

PROCESS:
1. Work only in your own worktree and branch. Never touch another checkout.
2. Write a short plan to docs/superpowers/plans/2026-10-28-<ticket>.md (superpowers writing-plans: tasks with exact files, test-first steps, commit subjects). Get the `planner` agent's second opinion once and fold it in. Then execute it with `/build docs/superpowers/plans/2026-10-28-<ticket>.md`.
3. If the Workflow runtime errors twice in a row, the owner authorizes the manual fallback for this session: superpowers test-driven-development per task, then `typescript-reviewer` (plus `react-reviewer` for .tsx, `security-reviewer` when auth/PII/network/secrets are touched, `silent-failure-hunter` for error paths), then `/verify`. Note the fallback in your ledger.
4. TDD for everything with logic. The engine stays pure (no I/O, no Date.now()/new Date() without arguments: "today" is always passed in), integer rupees, ISO date strings, engine line coverage at least 90%. Money never in floats beyond the utilization percentages.
5. Respect every CLAUDE.md non-negotiable (never show an exact predicted score, mask PAN, the LLM never computes numbers, no secrets in the repo, no AI attribution lines in commits or PRs, conventional commits with subject at most 72 chars).
6. Write only the files your ticket owns. If you need a change in a file you do not own, make the smallest local workaround and record it in your ledger as a follow-up instead of editing it.
7. Add dependencies only to your own workspace. On a pnpm-lock.yaml conflict: git checkout origin/main -- pnpm-lock.yaml && pnpm install.
8. Before every push: `pnpm verify` must exit 0.

FINISH (definition of done): all of the ticket's acceptance items pass as automated tests (or a Maestro flow for mobile UI); `pnpm verify` is green; write docs/agent-runs/2026-10-28-<ticket>.md (what you built, rulings, deferred items, commands and their output) and a process-journal entry at the journal number assigned to your ticket in docs/parallel-streams.md (use the process-journal skill; honest, specific, no hype); do not edit docs/status.md. Commit, then run: bash scripts/pm/open-pr.sh "<conventional title>" <path to a body file you wrote> <issue number>. Then watch CI with `gh pr checks <n> --repo ShubhamU55/credit-coach` (read-only on a public repo, so any logged-in account works; never run a mutating `gh` command with the default account). If CI is red, fix it on your branch, commit, and re-run the same open-pr command: it pushes again and reuses the open PR. Never merge, never enable auto-merge, never force-push main. Your final message: PR link, one-line test summary, anything the owner must do.
```

## Ticket prompts

Paste each after the common preamble. `<n>` is the issue number of the same-named ticket on the board.

### PD-1: Engine: types, reporting dates, payment planner

```text
TICKET PD-1 (issue on the board: "PD-1: Engine: types, reporting dates, payment planner"). Branch feat/pd-1-planner. Journal 004.
Build, in packages/engine/src: types.ts (Card, Payment, CoachRules, PlanInput, PlanItem, Plan, Shortfall, ReportingPoint), reporting.ts (PRD 5.4: nextReportingPoint(card, today, rules) for bases `statement` and `weekly_current`, pay-by = one day before the reporting point, configurable buffer days) and planner.ts (PRD 5.3: planPayments(input) with the five-step priority order, the "Aim for 10%" switch off by default, overdue and paid-since-statement tracking, remaining statement balance floored at 0, deterministic output, never more than a card's outstanding, shortfalls shown and never hidden). Export everything from index.ts (append only). Publish types.ts in your FIRST commit and push early; other streams read it from main.
Types guidance (you finalize them): integer rupees; IsoDate strings; Card = { id, name, issuer, limit, outstanding, lastStatementBalance, statementDay, dueDay, minimumDue, paidSinceStatement, interestRatePct? }; CoachRules = { thresholdPct (default 30), excellentPct (10), reportingBasis, payByBufferDays, aimFor10 (false), plannerStepOrder }; PlanItem = { step, kind: 'overdue_minimum'|'minimum'|'statement'|'prepay', cardId, amount, payBy, reason (a stable code plus a plain-English sentence), utilizationBefore, utilizationAfter }; Plan = { items, shortfalls, leftover, overallUtilizationAfter, highestCardAfter }.
ACCEPTANCE (all automated): (1) the Aarav golden test from docs/design.md section 8, exactly: cards HDFC Millennia 1,00,000/81,000/stmt 74,200 min 3,710 due 4 Nov stmt day 15; SBI SimplyClick 1,20,000/38,400/paid in full/next statement 25 Oct (no due date this cycle); Axis Neo 80,000/15,600/stmt 12,400 min 620 due 22 Oct stmt day 2; today 2026-10-21, cash 1,20,000, threshold 30, aimFor10 true gives steps 01 to 05 with the amounts, pay-by dates, utilization before/after, overall 7.3%, highest card 10.0%, left over 7,000; with aimFor10 false: overall 15.3%, highest 30.0%, left over 31,000; with threshold 20 and aimFor10 false: step 05 is SBI 14,400 (32.0 to 20.0), left over 19,000. (2) every PRD 5.3 acceptance example (cash >= everything; cash < minimums lists uncovered cards with shortfall; an overdue card is always first; changing the threshold changes step-4 amounts; never more than the outstanding; same input same output). (3) reporting dates for both bases incl. month-end and leap day. (4) fast-check property tests for the planner invariants (sum of amounts + leftover = cash; no negative amounts; plan items never exceed outstanding). Use the edge-case-hunter agent for boundaries.
```

### PD-2: Engine: score predictor, what-ifs, application guard

```text
TICKET PD-2 ("PD-2: Engine: score predictor, what-ifs, application guard"). Branch feat/pd-2-predictor. Journal 005.
Build in packages/engine/src: predictor.ts (PRD 5.5), whatif.ts, guard.ts (PRD 5.6), each with its OWN primitive input types so you do not depend on PD-1: PredictorInput = { anchor?: { score, date }, today, onTimePayments, missedPayments, overallUtilizationPct, maxCardUtilizationPct, hardInquiries6m, hardInquiries12m, oldestAccountMonths, openAccounts, securedAccounts, unsecuredAccounts }; PredictorWeights (documented defaults, adjustable); output = { low, high, band, reasons (top 3 with direction up/down/flat and the numbers behind them), isRoughBand } clamped to 300-900, range widening with days since the anchor, NEVER a single exact score, no ML. what-ifs: pay X on card Y, follow this month's plan, miss a payment, close card Y (lowers total limit, utilization rises, warns about credit age and limit loss when Y is the oldest account: non-negotiable 4), apply for a new card or loan, open an FD-backed card. guard: warn when hard inquiries in the last 6 months >= N (default 2, configurable) and show the estimated impact range. Export from index.ts (append only). Read the credit-domain skill: soft vs hard inquiries (F1: self-checks never hurt), weekly reporting (F3 unconfirmed: keep it a configurable basis).
ACCEPTANCE (automated): lower utilization never gives a lower estimate (property test); a missed payment never raises it (property test); closing a card shows rising utilization and the age warning when it is the oldest; no output field ever carries one exact score; clamping 300-900; range widens with time since the anchor; the Aarav numbers from docs/design.md section 8: current estimate 708-736 (anchor CIBIL 724 on 2026-10-02, 36 months zero missed, oldest account 6y 2m, 1 hard inquiry in 6 months, overall util 45%, max card util 81%, 3 cards) and follow-the-plan estimate 724-752 (aimFor10 off) / 731-759 (on) - choose and document default weights so the Aarav inputs reproduce these ranges, then state in your ledger that the weights were calibrated to the demo fixture. Use edge-case-hunter for boundaries and fast-check for the properties.
```

### PD-3: Kit A: harness, tokens, primitives, buttons, forms

```text
TICKET PD-3 ("PD-3: Mobile UI kit, part A"). Branch feat/pd-3-kit-a. Journal 006.
Execute tasks 1, 3, 4 and 5 of the existing plan docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md (task 2, the formatters, is already done; do NOT re-plan, reuse that plan and run `/build` on it with only those task ids). Your scope is apps/mobile/src/kit/** for those tasks plus the test harness. CRITICAL ORDER: do task 1 (test harness, fonts, tokens) FIRST and open its pull request IMMEDIATELY with scripts/pm/open-pr.sh (a second stream, PD-7, is blocked until it merges), then continue with tasks 3, 4, 5 and open a second PR for them. Read docs/design.md fully (tokens, components 6.1 to 6.3 and 6.10 to 6.12, accessibility section 10: touch targets at least 48dp, colour never the only signal, reduce-motion). Use the design-checker agent on your diff.
ACCEPTANCE: each component renders under the harness with tests, uses only design tokens (no raw hex outside the token file), meets the accessibility rules in design.md section 10 (role, label, state, 48dp targets), and `pnpm verify` is green. Your ledger lists the exported component names so screen streams can use them.
```

### PD-4: App shell: routes, demo repository, Aarav data

```text
TICKET PD-4 ("PD-4: Mobile app shell"). Branch feat/pd-4-app-shell. Journal 007.
Build the navigable skeleton of the Android app in apps/mobile so screens can be plugged in later without conflicts. Read apps/mobile/AGENTS.md first (Expo SDK 58 differs from your training data; read the bundled docs before using any API). Deliver: a router with routes Welcome, Home, Plan, Score and a Mark-as-paid bottom-sheet route (stubs showing the screen name and a testID are enough), a typed `DemoRepository` interface (getProfile, listCards, getRules, recordPayment(cardId, amount, date), reset) with an in-memory implementation seeded from a plain data file apps/mobile/src/demo/aarav.json built from docs/design.md section 8 and .design/credit-coach/INFORMATION_ARCHITECTURE.md ("Canonical sample data"; that file wins on a disagreement), React context or a small store exposing the repository to screens, and a fixed demo "today" of 2026-10-21 configurable in one place. Also keep the Maestro smoke flow in apps/mobile/.maestro green and add one flow: Welcome -> tap "Try sample profile" -> Home stub. Do not build real screens or kit components (other streams own them) and do not import the engine's planner yet (PD-1 is in flight): keep the data plain so the screen streams adapt it.
ACCEPTANCE: the app starts; every route is reachable; recordPayment lowers that card's outstanding in the in-memory repo (unit-tested); `pnpm verify` is green; the Maestro flow passes on the emulator following the maestro-android-e2e skill (commit the report as the skill describes).
```

### PD-5: Supabase: schema, RLS, seeds, explain function

```text
TICKET PD-5 ("PD-5: Supabase backend"). Branch feat/pd-5-backend. Journal 008. Docker Desktop must be running for the local Supabase stack.
Build in supabase/: migrations for profiles (linked to auth users, anonymous sign-in allowed for "Try sample profile"), cards, payments, consents (purpose + timestamp; PAN stored masked only), coach_rules (single global row with validated ranges, e.g. threshold 5-50), sample_profiles, audit_log (a trigger records who changed which rule and when), an admin role, row-level security on every table (user A cannot read or write user B; anonymous access limited), a reset_demo_data() function restoring default rules and sample profiles, and seed data for three personas (PRD section 6: high-utilizer Aarav per docs/design.md section 8, thin file, recovering). Add an Edge Function `explain` (Deno): input = the already-computed plan numbers as JSON; it asks Claude Haiku 4.5 for a short plain-English "Why this plan?" using ONLY those numbers; the key comes from the function secret ANTHROPIC_API_KEY (never in the repo); a hard 3-second timeout; strict input/output validation; on any failure it returns a deterministic template explanation with source "template". Tests: SQL or script-based RLS isolation tests against the local stack (user A / user B / anonymous), Zod-style contract tests for the function, a timeout-fallback test (the api-tester agent's rules apply).
Do NOT deploy and do NOT touch secrets: write supabase/OWNER-STEPS.md with the exact commands the owner runs (supabase login, link, db push, secrets set ANTHROPIC_API_KEY, functions deploy explain) and what to check afterwards.
ACCEPTANCE: `supabase db reset` applies cleanly locally; the RLS tests pass; the function's fallback path is tested; no secret or key appears anywhere in the diff; `pnpm verify` is green.
```

### PD-6: Release APK proof and install guide

```text
TICKET PD-6 ("PD-6: Release APK proof and install guide"). Branch feat/pd-6-release-apk. Journal 009. Needs an Android emulator or device on this machine.
Prove the standalone release APK builds and installs from current main, early, so the submission is not at risk on 30 Oct. Follow the maestro-android-e2e skill: run `pnpm --filter @credit-coach/mobile android:release`, install, run the existing smoke flow, commit the evidence the skill prescribes under docs/test-reports/. Write docs/install.md for judges (sideload steps for a stock Android phone, what to tap for "Try sample profile", known limits). If the build fails, fix only build configuration inside apps/mobile (android/, app.json, eas.json) and record exactly what failed and why; if you cannot fix it, document the fallback (local Gradle build vs EAS) with the real error output. Do not touch screens or kit code.
ACCEPTANCE: an APK path and size are recorded, the smoke flow passes on the installed release APK with evidence committed, docs/install.md exists and its commands were executed by you.
```

### PD-7: Kit B (start after PD-3's task-1 PR is merged)

```text
TICKET PD-7 ("PD-7: Mobile UI kit, part B"). Branch feat/pd-7-kit-b, cut from origin/main AFTER PD-3's first pull request (harness, fonts, tokens) has merged. Journal 010.
Execute tasks 6 to 11 of docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md with `/build` on those task ids: information blocks (6.6, 6.14, 6.16, 6.20, the verbatim disclaimer, the sample strip), card surfaces (6.4, 6.5), plan visuals (6.7, 6.8, 6.9), score visuals (6.13, 6.15), app chrome (6.17, 6.18, 6.19) and the kit gallery with Maestro screenshots. Same rules as PD-3 (tokens only, accessibility section 10, design-checker on the diff). Merge-order tip: open one PR per two tasks so screen streams can start from the first ones (plan visuals and score visuals are the most needed); list exported component names in your ledger as you go.
ACCEPTANCE: as in the plan, plus the gallery renders every component and the ranges never wrap or truncate.
```

### PD-8: Screens: Welcome + Home (wave 2)

```text
TICKET PD-8 ("PD-8: Screens: Welcome and Home"). Branch feat/pd-8-welcome-home. Journal 011. Start only when PD-1, PD-4 and PD-7 are merged.
Build Welcome (docs/design.md 7.1: "Try sample profile" is the primary CTA, no sign-up, the disclaimer) and Home (7.2: totals, overall utilization gauge with 30% and 10% markers, per-card tiles with colour-coded utilization, next statement and due dates, the top three "Next actions" from the planner, the estimated score range card (a stub linking to Score until PD-10), the verbatim disclaimer footer, the "Sample profile - Switch" strip) in apps/mobile/src/screens/{welcome,home}/**, using ONLY kit components and the DemoRepository from PD-4, and the engine's planPayments from PD-1 (adapt the plain demo data to the engine types in a small adapter you own, e.g. apps/mobile/src/screens/home/adapter.ts). A card with limit 0 or missing is excluded from utilization and flagged (PRD 5.2). No full PAN anywhere (non-negotiable 5).
ACCEPTANCE: tapping "Try sample profile" shows Home with the Aarav numbers from docs/design.md section 8 (overall 45.0%, three cards, plan top three) without any typing; a Maestro flow asserts it (commit the report); every screen string comes from design.md section 9 copy; `pnpm verify` is green.
```

### PD-9: Screens: Plan + Mark as paid (wave 2)

```text
TICKET PD-9 ("PD-9: Screens: Plan and Mark as paid"). Branch feat/pd-9-plan. Journal 012. Start only when PD-1, PD-4 and PD-7 are merged.
Build Plan (docs/design.md 7.3: the ordered steps with pay-by dates and utilization before to after, the timeline, the "Aim for 10% utilization" switch off by default, shortfalls shown never hidden, the reason line in plain words, the outcome summary) and the Mark as paid bottom sheet (7.4: full or partial amount, announces the result to screen readers) in apps/mobile/src/screens/plan/**. Marking a payment calls DemoRepository.recordPayment, the plan is recomputed from current state every time the screen opens (PRD 5.3, not a frozen object), and the payment lowers that card's outstanding everywhere (design.md 7.4 rule 8: Home reflects it too). Use only kit components.
ACCEPTANCE: the Plan screen for Aarav matches the golden table in docs/design.md section 8 for both switch states; the admin demo moment (threshold 20%, switch off) is reproducible by changing the rules in the repository and shows SBI 14,400; marking step 03 paid updates the plan; a Maestro flow covers Plan -> Mark as paid -> plan updated (commit the report); `pnpm verify` is green.
```

### PD-10: Screens: Score + what-ifs + guard (wave 2)

```text
TICKET PD-10 ("PD-10: Screens: Score, what-ifs and guard"). Branch feat/pd-10-score. Journal 013. Start only when PD-2, PD-4 and PD-7 are merged.
Build Score (docs/design.md 7.5) in apps/mobile/src/screens/score/**: the estimated range with its zone word and the top three reasons with direction arrows, labelled as an estimate, NEVER one exact score; what-if scenarios from PD-2 (pay X on card Y, follow this month's plan, miss a payment, close card Y with its credit-age and limit-loss warning, apply for a new card or loan, FD-backed card) as simple result views; the application-guard warning when hard inquiries in the last 6 months reach the configured N. The what-if result screens are listed under "Not designed yet" in design.md section 12: follow the same tokens and kit components, keep them minimal, and record your layout decisions as rulings. Adapt the demo data to the predictor's primitive inputs in a small adapter you own.
ACCEPTANCE: Aarav shows 708-736 (Good) with anchor CIBIL 724 on 2 Oct; "close HDFC Millennia" shows the oldest-account warning and rising utilization; no screen shows an exact score; a Maestro flow covers Home -> Score -> a what-if (commit the report); `pnpm verify` is green.
```

### PD-11: Explanations (wave 2)

```text
TICKET PD-11 ("PD-11: Explanations: Why this plan?"). Branch feat/pd-11-explain. Journal 014. Start when PD-1 and PD-4 are merged (PD-5 is only needed for the live call).
Engine side: packages/engine/src/explain.ts builds the deterministic template explanation and the strict JSON the explain function receives, from a Plan (numbers only; the LLM never computes amounts, dates or scores: non-negotiable 2). App side: apps/mobile/src/explain/** calls the Supabase `explain` Edge Function (PD-5) through a small client with a 3-second timeout and falls back to the template on any error, timeout or missing configuration; the UI labels AI-written text as such and shows the template silently otherwise. The app must be fully usable with the function absent. Expose a hook the Plan screen (PD-9) can render ("Why this plan?"); do not edit the Plan screen yourself, list the one-line integration in your ledger.
ACCEPTANCE: template explanation unit tests for the Aarav plan and the shortfall case; a client test where the function times out and where it returns malformed JSON (both fall back); no key or URL secret in the diff; `pnpm verify` is green.
```

### Wave 3 (short prompts; same preamble)

```text
PD-12 Bureau linking flow with the demo provider (PRD 5.1, apps/mobile/src/screens/link/**): PAN + mobile, consent screen (what is fetched, why, retention, timestamped purpose), on-screen demo OTP 123456, "Fetching your credit report", discovered accounts to pick, then fill missing fields per card. PAN masked everywhere, never stored in full. Demo provider returns the three sample personas. Start after PD-4 and PD-7. CUT FIRST if late.
PD-13 Reminders (PRD 5.7, apps/mobile/src/reminders/**): local notifications for the pre-payment window, the due date (3 and 1 day before) and the monthly score re-check; configurable offsets, per-type on/off; stop once the minimum (due-date reminders) or planned amount (pre-payment) is marked paid. Start after PD-1 and PD-4. CUT FIRST if late.
PD-14 Admin control center, thin (PRD 6, apps/admin/**): login for one admin role, coach-rules form with validated ranges (e.g. threshold 5-50), audit log, sample-profile list; the demo moment is threshold 30 to 20 changing the app's plan. Read apps/admin/AGENTS.md (Next 16) first. Playwright E2E for login, rule edit -> audit entry. Needs PD-5 deployed by the owner. CUT FIRST if late.
PD-15 Hardening: Maestro demo path end to end from a fresh install ("Try sample profile" -> Home -> Plan -> Mark as paid -> Score) on the release APK within 60 seconds, a security review pass over the whole diff (security-reviewer, PAN masking, secrets, RLS), accessibility spot checks at 200% font, the final release APK recorded with size and checksum, all evidence under docs/test-reports/. Own apps/mobile/.maestro/** and docs/test-reports/**.
PD-16 Submission (docs only): README run section and a judge's quick-start, the demo video script (3 to 5 minutes, the order of the demo path plus the admin demo moment if PD-14 shipped), the final process-journal entry for the product phase, fold the streams' run ledgers into docs/status.md, and the submission write-up: problem, who it is for, what was built, how AI helped (link docs/ai-system.md and the journals). Be honest about what is cut.
```

## If time runs short (cut order)

1. PD-14 admin, then PD-13 reminders, then PD-12 linking. Their PRD sections move to "in scope, planned" in the write-up.
2. PD-11 falls back to template-only (the app never depends on the LLM).
3. Never cut: PD-1, PD-2, PD-4, PD-7, PD-8 to PD-10, PD-15, PD-16. The judges' path must work unaided, with an on-screen demo OTP and no SMS.
