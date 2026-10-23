<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Development Workflow

> This file extends [git-workflow.md](./git-workflow.md) with the development process that happens before git operations. See [agents.md](./agents.md) for the agent roster.

## Current workflow

0. **Read first:** the relevant `docs/PRD.md` section and the `credit-domain` skill.
1. **Plan:** superpowers `writing-plans` (the **planner** agent is an optional second opinion).
2. **TDD:** superpowers `test-driven-development`. Engine coverage ≥ 90% lines; apps covered by E2E flows.
3. **Review:** `typescript-reviewer`; plus `react-reviewer` for `.tsx`; plus `security-reviewer` for auth/PII/network/secrets; plus `silent-failure-hunter` for error paths.
4. **Verify:** `/verify`.
5. **Record:** `/journal`.
6. **Commit & push:** conventional commits; see [git-workflow.md](./git-workflow.md).

## Planned pipeline (Plan 1c)

The slash commands and workflows below are planned, not yet built — even though some of the agents they name (`implementer`, `test-automator`, `build-error-resolver`, `gate-checker`, `functional-tester`, `edge-case-hunter`, `finding-verifier`; see [agents.md](./agents.md)'s Built roster) already exist as of Plan 1c Wave 1. The other named agents (`requirements-analyst`, `api-tester`, `ui-tester`, `integration-tester`, `domain-checker`, `design-checker`, `pr-reviewer`, `pr-test-analyzer`, `bug-analyst`, `bug-reporter`, `pm-sync`, `journal-writer`) are not built yet either. Until the orchestrating workflow lands, use the current workflow above and dispatch a built agent directly where one fits.

- **`/feature`** (workflow `feature-analyze` → `feature-build`) — **requirements-analyst** scopes the ticket, **planner** plans it, **implementer**/**test-automator** build it test-first, **build-error-resolver** fixes failing builds, **gate-checker** runs the quality gates before handoff.
- **`/build`** — the build step of the pipeline above, gated by **gate-checker**.
- **`/qa`** (workflow `qa`) — **functional-tester**, **edge-case-hunter**, **api-tester**, **ui-tester** and **integration-tester** exercise the change; **domain-checker** and **design-checker** check it against the credit-domain facts and `docs/design.md`; **finding-verifier** confirms findings before they block.
- **`/pr-review`** (workflow `pr-review`) — **pr-reviewer** and **pr-test-analyzer**, plus the specialist reviewers in [agents.md](./agents.md).
- **`/bugfix`** (workflow `bugfix`) — **bug-analyst** root-causes the bug, then the current workflow's TDD loop applies.
- **`/bug`** — **bug-reporter** files a reproducible report.
- **`/retro`** (workflow `retro`) — **pm-sync** and **journal-writer** record what happened.
- **`/tidy`** — a housekeeping pass (lint, format, dead code); no dedicated workflow.
