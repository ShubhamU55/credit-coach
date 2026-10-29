# Credit Coach: submission write-up

Hack@FiftyFive "Build With AI" Hackathon 2026. Solo build. Submission due 30 Oct 2026 EOD.

> **How to read the status in this document.** Every "built", "merged" and "tested" claim below is
> measured against `origin/main` at `23ba4be` on 2026-10-29 (the merge of PR #62), or against a named
> branch and ledger. Nothing that is not on `main` is called shipped. If you are reading this after more
> pull requests merged, the table in section 3 is the thing to re-check; the owner updates it at merge time.

## Links to fill before submitting (owner)

| Deliverable                  | Link                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Release APK (GitHub release) | **Not built for judges yet.** See section 6. Paste the release URL here once PD-15 attaches it |
| Demo video (3 to 5 min)      | **Not recorded yet.** The shot list is [`docs/demo-script.md`](demo-script.md)                 |
| Public repo                  | https://github.com/ShubhamU55/credit-coach                                                     |
| Project board                | https://github.com/users/ShubhamU55/projects/1                                                 |

## 1. The problem

People in India who hold several credit cards care about their CIBIL score and do not know what to do _this
month_ to protect it. Apps such as CRED, OneScore and the bank apps show a score and dues. Few say which card to
pay, how much, and by when.

The fact the product leans on: the bureau sees the balance a lender **reports** at a reporting point, typically
the statement balance (and, since 2026, also weekly snapshots). It does not see what is left after you pay by the
due date. A person who pays in full every month can still show high utilization. The domain facts F1 to F7 are in
[`docs/PRD.md`](PRD.md) section 4 and the `credit-domain` skill.

## 2. Who it is for, and what it is

**For** salaried people in India with two or more credit cards (sometimes FDs and loans) who pay on time but see
a score that does not reflect it, or who are one missed payment away from a bad month. The demo persona is Aarav
Mehta (sample): three cards, one at 81% utilization, 45.0% overall, an estimated score of 708 to 736.

**What it does:** turns the cards into a monthly plan (which card, how much, pay by when, in what order), shows the
utilization before and after, and shows an **estimated score range with reasons**, never one exact number.
Tracking is the input; the plan is the product.

**What it does not do:** execute payments, link real bank accounts, or call a real bureau. Android only, English
only.

## 3. What was built, and what is cut

Measured at `origin/main` `23ba4be`, 2026-10-29. Run ledgers are in [`docs/agent-runs/`](agent-runs/).

| Ticket | What                                                                       | State                                                                                                                                  |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| PD-1   | Engine: reporting dates and the payment planner (PRD 5.3, 5.4)             | **Merged** (#55). Aarav golden plan reproduced exactly                                                                                 |
| PD-2   | Engine: score predictor, what-ifs, application guard (PRD 5.5, 5.6)        | **Merged** (#57). Weights calibrated to the demo fixture (see section 7)                                                               |
| PD-3   | Mobile kit part A: harness, tokens, primitives, buttons, forms             | **Merged** (#56, #58)                                                                                                                  |
| PD-4   | App shell: routes, in-memory `DemoRepository`, Aarav seed data             | **Merged** (#59). Routes are stubs until PD-8 to PD-10 land                                                                            |
| PD-7   | Mobile kit part B: cards, plan and score visuals, chrome, gallery          | **Merged** (#60)                                                                                                                       |
| PD-11  | "Why this plan?": template explanation and Edge Function client            | **Merged** (#62). Not wired into the Plan screen yet; the function is not deployed, so the text is always the template (section 6)     |
| PD-8   | Screens: Welcome and Home                                                  | **Built, awaiting device evidence.** Branch `feat/pd-8-welcome-home`, 6 commits, reviewed and fixed, no PR yet, Maestro flow never run |
| PD-9   | Screens: Plan and Mark as paid                                             | **Built, awaiting device evidence.** Branch `feat/pd-9-plan`, 9 commits, reviewed and fixed, no PR yet, Maestro flow never run         |
| PD-10  | Screens: Score, what-ifs and guard                                         | **Built, awaiting device evidence.** Branch `feat/pd-10-score`, 9 commits, reviewed and fixed, no PR yet, Maestro flow never run       |
| PD-5   | Supabase: schema, RLS, personas, `explain` Edge Function                   | **Written, not merged, not deployed.** Branch `feat/pd-5-backend`, 3 commits, no PR. Real-stack checks never run (section 6)           |
| PD-16  | This submission                                                            | This PR                                                                                                                                |
| PD-6   | Release APK proof and install guide                                        | **Not started.** No `docs/install.md`                                                                                                  |
| PD-15  | Hardening: demo path on a release APK, security pass, 200% font, final APK | **Not started**                                                                                                                        |
| PD-12  | Bureau linking flow with a demo provider (PRD 5.1)                         | **Cut.** Worktree exists, no commits                                                                                                   |
| PD-13  | Reminders (PRD 5.7)                                                        | **Cut.** Worktree has only uncommitted dependency edits, no commits                                                                    |
| PD-14  | Admin control center (PRD 6)                                               | **Cut.** `apps/admin` is still the stock Next scaffold                                                                                 |

"Awaiting device evidence" means: the screens exist on a branch with passing Jest tests, but they are not on
`main`, and the Maestro flow that would prove the path on a device was written and never run (the build machine had
no spare RAM for an emulator, and the owner's physical phone is the planned evidence run). The CI `maestro-evidence`
gate requires a committed report before any of these merge.

**PRD coverage.** 5.3 planner, 5.4 reporting dates, 5.5 predictor, 5.6 guard and the template half of 5.8 are real
and tested in the engine on `main`. 5.1 is the sample-profile path only: there is no sign-up, sign-in or bureau
linking (the PRD allows a no-SMS path; the sample path needs none). 5.2 and the screens of 5.3, 5.5 and 5.6 are the
PD-8/9/10 branches. 5.7 reminders and section 6 (admin) are cut and move to "in scope, planned" in this write-up,
which is exactly the order the PRD's cut line (`PRD.md` section 9) and `docs/parallel-streams.md` set.

**What is true on `main` today.** The app opens, the Welcome stub's "Try sample profile" reaches a Home stub, and the
other routes (Plan, Score, Mark as paid) open stub screens. A `/kit` route renders every kit component (the
"gallery"). The engine behind the real screens is complete and tested. The judges' path (sample profile, Home, Plan,
Mark as paid, Score) becomes real when PD-8, PD-9 and PD-10 merge. It has **not** yet been run as one flow on a
device, so the PRD goal "a plan within 60 seconds of install" is unproven end to end.

## 4. How AI was used to build it

This is the part the judges weigh most, so it is split into what was built before the product, how the product
phase ran, and the numbers with where they come from.

### 4.1 Before the product: an agentic delivery system (Plan 1c)

Most of the first week (21 to 28 Oct) went into building the process before the product, on purpose: the PRD says judges weigh
how AI was used. [`docs/ai-system.md`](ai-system.md) is the one-page overview, with its own list of what is
untested. It describes **26 agents, 11 slash commands, 6 Workflow scripts, 12 project skills and 5 hooks**, the
drift guard (an agent's own `status` never counts; `gate-checker` reports git facts and script code judges them),
retries and escalation, and the verifier policy (`finding-verifier` tries to refute every finding, default
refuted).

It was built as 24 tickets in 6 waves (Plan 1c, board issues #13 to #36) and reviewed by the same kind of agents it
ships. Three entries from that phase show the reviews doing real work:

- [Journal 001](journal/001-agentic-system-dry-run.md): the first real `/build` run caught the pipeline itself
  silently overriding an approved plan's explicit requirement (`maskPan('ABC')` must throw) and rewriting the
  plan's test to match. Caught before merge; the fix was to give reviewers and verifiers the plan's own text.
- [Journal 002](journal/002-wave-3-agents-and-rce-catch.md): a security review reproduced a remote-code-execution
  path in `pr-reviewer`'s example shell script, fixed in the next round.
- [Journal 003](journal/003-agentic-system.md): reviews of the new workflows found several fail-open gates, all
  fixed before merge.

Decisions: [ADR 0001](adr/0001-tech-stack.md) (stack), [0002](adr/0002-curated-ai-dev-setup.md) (curate ECC
rather than fork it), [0003](adr/0003-agentic-delivery-system.md) (how agents are coordinated and gated),
[0004](adr/0004-token-optimization-tools.md) (token-optimization tools). The usage policy is
[`docs/ai-policy.md`](ai-policy.md).

### 4.2 The product phase (28 to 29 Oct): parallel sessions under a coordinator

Plan: [`docs/parallel-streams.md`](parallel-streams.md). The product was cut into 16 tickets (PD-1 to PD-16,
issues #38 to #53) with disjoint file ownership, one implementer per ticket in its own git worktree, and a
coordinator session that dispatched reviewers, pushed and opened the PRs. The owner approved scope and merged
every PR (through GitHub auto-merge once checks were green). **The coordinator's ledger, with every ruling and its cost-if-wrong, is
[`docs/agent-runs/2026-10-28-coordinator.md`](agent-runs/2026-10-28-coordinator.md)** (it lands with the
coordinator's branch `coord/product-ledger`; until then it is only in the coordinator's worktree).

An honest description of how it actually ran, because it differs from the design in `docs/ai-system.md`:

- **The product phase did not use the `/build` Workflow pipeline.** Subagents cannot start Workflows or dispatch
  agents, so implementers worked **by hand and test-first** (superpowers `test-driven-development`), and the
  coordinator ran the reviewers by hand. The coordinator's first ruling records this and its cost. The live
  Workflow runtime is mostly untested (see `docs/ai-system.md`), and this phase did not change that.
- Each ticket followed the same loop: plan file in `docs/superpowers/plans/`, implementer builds test-first, a run
  ledger and a journal entry, then reviewers (the set chosen by the changed paths: `code-reviewer`,
  `design-checker`, `react-reviewer`, `security-reviewer`, `silent-failure-hunter`, `edge-case-hunter` and
  domain checks), then one fix round at a time with a scoped re-review, then the PR and CI.
- Device-bound work (Maestro evidence) ran one job at a time through a dedicated evidence-runner agent on a
  single emulator. It found real build problems (Windows MAX_PATH), recorded in
  [`docs/test-reports/maestro-2026-10-28-pd4-shell.md`](test-reports/maestro-2026-10-28-pd4-shell.md).
- The account's usage limit interrupted three implementers mid-ticket on 28 Oct; they were resumed in place, with
  no work lost. The coordinator also stopped starting new tickets when the owner said usage was high.
- CI is the independent gate: `verify`, `admin-e2e`, `secrets`, `deps`, `codeql`, `sonar`, `maestro-evidence`,
  `hold-check`, on a protected `main` with squash-only merges. The `pr-review` status (G8) is **advisory**, not
  required, because author, reviewer and status creator are the same GitHub account
  ([`docs/status.md`](status.md), 2026-10-27 entry).

### 4.3 The numbers, and where each comes from

| What                                                 | Number                                                                                                                                                                    | Source                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product PRs merged                                   | 7 (#55 to #60, #62)                                                                                                                                                       | `git log origin/main`                                                                                     |
| Reviewer and tester runs on product tickets          | **at least 36** (PD-1 3, PD-2 3, PD-3 4, PD-4 4, PD-7 4, PD-8 4, PD-9 6, PD-10 4, PD-11 4)                                                                                | Counted from the coordinator ledger's dispatch entries; grouped entries such as "react/edge" count as two |
| Fix rounds                                           | 10 (PD-9 took 2, the rest 1), plus a Sonar fix on PD-4 and a finalize pass on PD-7                                                                                        | Coordinator ledger                                                                                        |
| Findings a scoped re-review confirmed fixed (wave 1) | 31 (PD-1 5, PD-2 4, PD-3 10, PD-4 6, PD-7 6); wave 2 re-reviews were clean, counts are in the per-ticket ledgers                                                          | Coordinator ledger                                                                                        |
| Critical findings left open at merge                 | 0 known. PD-4's "Critical" was "Maestro not run"; it was run before merge                                                                                                 | Coordinator ledger, PD-4 entries                                                                          |
| Engine tests on `main`                               | **255 passed, 99.66% lines** (gate is 90%)                                                                                                                                | `pnpm --filter @credit-coach/engine test` at `23ba4be`, 2026-10-29                                        |
| Mobile and hooks tests on `main`                     | **604 mobile tests (32 suites)** and **1,714 hook and workflow tests** (all pass; detail and a load flake in `docs/agent-runs/2026-10-28-pd-16.md`, "Commands")           | `pnpm verify` steps at the PD-16 head on `23ba4be`'s code, 2026-10-29                                     |
| Unmerged branch tests (not added to the above)       | PD-9 branch 616 mobile tests (34 suites); PD-10 branch 627 (34 suites); PD-5 72 Vitest plus 115 SQL checks on a throwaway embedded Postgres (not the real Supabase stack) | Each branch's run ledger                                                                                  |
| Device evidence                                      | 7 Maestro run notes under `docs/test-reports/`, all on release APKs on a Pixel 7 emulator, all against the stub screens and the kit gallery                               | `docs/test-reports/maestro-2026-10-2*.md`                                                                 |

The per-ticket run ledgers: [PD-1](agent-runs/2026-10-28-pd-1.md), [PD-2](agent-runs/2026-10-28-pd-2.md),
[PD-3](agent-runs/2026-10-28-pd-3.md), [PD-4](agent-runs/2026-10-28-pd-4.md),
[PD-7](agent-runs/2026-10-28-pd-7.md), [PD-11](agent-runs/2026-10-28-pd-11.md). The ledgers for PD-5, PD-8, PD-9
and PD-10 are `docs/agent-runs/2026-10-28-pd-{5,8,9,10}.md` on their branches and land with their PRs. The journal
entries are in [`docs/journal/`](journal/): 000 to 007, 010, 014 on `main`; 008, 011, 012 and 013 land with their PRs;
019 is this phase.

### 4.4 Where the AI was wrong, and what caught it

Selected from the ledgers (each is one real defect; the ledger names the file and the fix):

- **Money bug in the kit.** `AmountInput` turned a pasted "1,200.50" into 120050, a 100x error. `react-reviewer`
  found it; fixed test-first in PD-3's fix round (10 of 10 items re-verified).
- **A way to show one exact score.** The predictor's config accepted a zero half-width, which collapses the range to a
  single number, against non-negotiable 3. `edge-case-hunter` reproduced it; config is now validated (31 bad
  configs tested), PD-2 fix round.
- **A planner hole.** With a reordered step order, a prepay could hide an unpaid minimum past its due date; a
  fractional threshold was one rupee off (33.3% of a 3,000 limit). Both fixed in PD-1's round.
- **A missing safety slot.** The kit had no place for the close-card credit-age and limit-loss warning
  (non-negotiable 4). `design-checker` flagged it; PD-7 added a `WhatIfResult` that cannot render the close-card
  variant without both warnings, with a test.
- **An access-control bug the author's own test found.** In PD-5, `reset_demo_data()` checked `session_user` and let
  every caller through; the throwaway-Postgres run failed 2 of 115 checks until fixed.
- **Sonar caught what reviewers missed.** PR #59's quality gate failed on one `.map(parseCard)` (rule S7727); fixed and
  the evidence re-run. The lesson went into later briefs.
- **The AI overrode the spec, once, and a human did not.** Journal 001, above. The fix was structural, not a note.

### 4.5 Limits of this evidence

- The reviewers are AI agents of the same family as the implementers; independence is by role and prompt, not by
  model. Findings were verified adversarially in Plan 1c's workflows; in the product phase the coordinator was the
  verifier.
- Counts in section 4.3 are from the ledgers, not from a metrics system; they are floors, not totals.
- `pr-review` is self-attested (section 4.2). A human (the owner) merged every PR.

## 5. Product rules the build enforced

These come from `CLAUDE.md` and are the reason several reviews exist. Each has a test or a named reviewer.

- The engine is pure (ESLint bans I/O, `Date.now()`, `Math.random` in `packages/engine`); "today" is passed in.
- The LLM never computes a number: the engine writes the template and the strict payload; the function and client
  only word it, and drop AI text whose numbers are not in the payload (PD-11, PD-5).
- No exact predicted score anywhere; always a range plus reasons, clamped to 300 to 900, labelled an estimate.
- Closing a card always shows the credit-age and limit-loss warning.
- PAN is masked (`ABXXXXX34F`); no full PAN in any seed, test or doc; no secret in the repo (secret scan in CI).
- Estimates are engine output, not mockup copy: close HDFC Millennia shows 698 to 726 from the engine, not the
  mockup's figure, because the weights are calibrated only to the numbers in `docs/design.md` section 8.

## 6. Honest limits and what the owner still has to do

1. **No release APK for judges exists yet.** The APKs built so far (30 to 68 MB; all but the first x86_64 only) were
   evidence builds of earlier commits for the emulator. The all-ABI APK is a PD-15 task and was not started. Until it is attached to a GitHub release,
   a judge has to build from source (README quick-start, track C) or watch the video.
2. **PD-8, PD-9, PD-10 are unmerged.** Each needs its Maestro run on a physical phone (or the emulator) and a
   committed report before the `maestro-evidence` gate lets it merge. Merge order from the coordinator ledger:
   PD-8, then PD-9 and PD-10 (the PD-9 and PD-8 onboarding flows conflict; take PD-8's).
3. **The Supabase backend is not deployed and its real-stack checks were never run.** `supabase db reset`,
   `supabase test db` (real pgTAP), the Edge Function under Deno and the live Anthropic call are written and not
   executed (no Docker, no Deno on the build machine). The owner's commands are in `supabase/OWNER-STEPS.md` on the
   PD-5 branch. The app is built to work with the function absent: "Why this plan?" falls back to the template, and
   the app never depends on the LLM.
4. **"Why this plan?" is template text with no AI label on any build today.** The PD-9 Plan screen still calls its own
   template; swapping in the PD-11 hook is a recorded one-line follow-up. The hook labels AI text as AI-written only
   if the deployed function answered.
5. **No sign-up, no sign-in, no bureau link** (PD-12 cut; Welcome carries no dead buttons by ruling).
6. **No reminders** (PD-13 cut) and **no admin panel** (PD-14 cut). The admin demo moment (threshold 30% to 20%
   changes the plan) exists only as an engine test: `packages/engine/src/planner.golden.test.ts`, "admin demo moment",
   which asserts step 05 becomes SBI 14,400 and the left over 19,000.
7. **No Undo** after "Mark as paid" (PD-9 ruling: the repository has no undo). The design asks for one; the owner may
   waive it or add it to the repository.
8. **Estimates are calibrated to one fixture.** The predictor's weights reproduce Aarav's 708 to 736, 724 to 752 and
   731 to 759; they are documented defaults, not a model fitted to real bureau data. The zone cut-points and weights are
   placeholders in `docs/design.md` section 8.
9. **The hooks test suite is flaky under load** (5-second timeouts when several sessions run at once); it passes alone.
   CI is the authoritative gate.
10. **Security pass over the whole diff (PD-15) did not run.** A `security-reviewer` ran on PD-4, PD-9 and PD-11 only.
    PD-5 (RLS, the Edge Function) had the implementer's own security checklist and no reviewer run on record in the
    coordinator ledger.

## 7. Decisions worth a judge's time

- Why the plan is the product and the score is a range: `docs/PRD.md` section 1 and 5.5.
- The "Aim for 10% utilization" switch, off by default: an owner decision of 21 Oct that amends PRD step 4; PRD v1.1.
  It exists because following the plan with the switch on still leaves the score in "Good".
- Weights calibrated to the fixture: [`docs/agent-runs/2026-10-28-pd-2.md`](agent-runs/2026-10-28-pd-2.md).
- Why `src/ui`, not `src/kit`, and why PD-7 was stacked on PD-3: the coordinator ledger, 2026-10-28 entries.
- Percent thresholds round to hundredths in the planner; the admin range is 5 to 50 in whole or one-decimal steps.

## 8. Reproduce it

Commands and what each proves are in the README quick-start. The shortest check that the logic is real:

```bash
pnpm install --frozen-lockfile
pnpm --filter @credit-coach/engine test   # includes the Aarav golden tests from docs/design.md section 8
```
