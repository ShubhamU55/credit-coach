# Project status and handoff

> Read this first when starting a new session. Update it at the end of every session (newest entry on top).

## 2026-10-21 (end of session 2)

### What changed

- **Plan 1c written:** `docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md`. It isn't committed yet and is **awaiting owner review**.
  - It has 6 dependency waves and 24 tickets, and file ownership is disjoint within a wave.
  - Shared workflow logic lives in `.claude/hooks/lib/contracts.mjs`. Each workflow carries a byte-identical copy, and a test checks it.
  - The dry run on Plan 4a Task 2 moves up to Wave 2, before the second batch of agents.
  - G8 (`pr-review`) is a **commit status**, not a review: GitHub rejects approving your own PR.
- No owner blocker has been cleared yet. The ShubhamU55 token still has only `repo` scope, Docker isn't running, and Supabase isn't linked.

**Wave 0 progress (W0-7, last ticket):** agent lint, config audit, and scratch-header checks landed in `.claude/hooks/tests/` (`agents-lint.test.mjs`, `config-audit.test.mjs`, `scratch-headers.test.mjs`); `scratch/README.md` documents the §8.6 header format. All three checks were proven to bite (probe files added and removed) and `pnpm verify` is green on a clean tree. **Wave 0 is done; Wave 1 is next.**

### Next step

- **Owner:** review Plan 1c and choose how to execute it.
- **Then:** Wave 1 (see Plan 1c for the ticket list; Wave 0's W0-1 through W0-7 are complete).
- **New owner action:** create the SonarQube Cloud org, turn off Automatic Analysis, and add the `SONAR_TOKEN` secret. See Plan 1c, "Owner actions".

## 2026-10-21 (end of session 1)

### Where things stand

| Item                                                   | State                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD                                                    | **Frozen v1.1**: `docs/PRD.md` (v1.1 gates planner step 4(b) behind the "Aim for 10% utilization" switch)                                                                                                                                                                                                                                                                   |
| Tech stack                                             | Approved: `docs/tech-stack.md`, ADR 0001                                                                                                                                                                                                                                                                                                                                    |
| UI design                                              | `docs/design.md` (v3 "Midnight") + `docs/design-mockups/v3/`                                                                                                                                                                                                                                                                                                                |
| **Agentic dev system design**                          | **Approved**: `docs/superpowers/specs/2026-10-21-agentic-dev-system-design.md`. **Next step: write Plan 1c from it (superpowers `writing-plans`), as tickets designed for parallel sessions (spec §8.5)**                                                                                                                                                                   |
| Plan 1: Foundation                                     | Tasks 1, 2, 3, 4, 6, 7 **done**. Task 5 **partly done**: CI workflow and `supabase init` committed; repo push, Supabase link and EAS build are blocked on the owner. Task 8 (journal 000, README, fresh-clone check) is **pending the push**. Ledger: `.superpowers/sdd/2026-10-21-plan-1-foundation/progress.md` (local; copy it to `docs/agent-runs/` when Plan 1 closes) |
| Plan 4a: Mobile UI kit                                 | Written: `docs/superpowers/plans/2026-10-21-plan-4a-mobile-ui-kit.md`. **Not started.** It is the first feature to run _through_ the Plan 1c agent system                                                                                                                                                                                                                   |
| Plans 2 (engine), 3 (backend), 4b (screens), 5 (admin) | Not written yet                                                                                                                                                                                                                                                                                                                                                             |
| GitHub                                                 | Public repo **https://github.com/ShubhamU55/credit-coach** created, **nothing pushed yet**                                                                                                                                                                                                                                                                                  |

### Blockers (owner actions)

1. `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project`. The token currently has only `repo`, and the push was rejected because `ci.yml` needs the `workflow` scope.
2. `npx supabase login`, then create the free project `credit-coach` (Mumbai) and share its **project ref**.
3. `npx eas-cli login` (optional; the local release APK already works).
4. Docker Desktop must be running for local Supabase (API and RLS tests, spec §8.7).

### How to push without changing the active gh account

The owner's default `gh` account is the work account (ShubhamUpadhyay-Nibe). Push with the ShubhamU55 token for that one command only:

```bash
export TOK=$(gh auth token --user ShubhamU55)
git -c credential.helper= -c 'credential.helper=!f() { echo username=ShubhamU55; echo "password=$TOK"; }; f' push -u origin main
unset TOK
```

### Owner decisions to remember

- Judges weigh the **AI setup** more than the product idea. Treat the agent system as first-class.
- Money is **integer rupees**. **Security is a first-class gate.** **Reuse the maximum from affaan-m/ECC** (spec §14).
- PRs merge only through **agent PR review plus 9 merge gates** (spec §8.9).
- **Everything is committed.** Temporary files go in `scratch/` with an expiry (spec §8.6).
- Project management is a **GitHub Projects** board (spec §9).
- Commits have **no AI co-author or "Generated with" lines**.

### Environment notes

- **Emulator:** Pixel_7.
  - If adb shows `offline`, cold-boot with `-no-snapshot`.
  - Run `adb emu multidisplay del 1` (the AVD has a second display).
  - Dismiss any System UI "not responding" dialog.
  - Details are in the `maestro-android-e2e` skill.
- **Build times:** first release build ~13 min; incremental ~40 s. `nodeLinker: hoisted` is required (Windows path length).
