<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Development Workflow

> This file extends [git-workflow.md](./git-workflow.md) with the development process that happens before git operations. See [agents.md](./agents.md) for the agent roster.

## Manual loop (one feature, one session)

0. **Read first:** the relevant `docs/PRD.md` section and the `credit-domain` skill.
1. **Plan:** superpowers `writing-plans` (the **planner** agent is an optional second opinion).
2. **TDD:** superpowers `test-driven-development`. Engine coverage ≥ 90% lines; apps covered by E2E flows.
3. **Review:** `typescript-reviewer`; plus `react-reviewer` for `.tsx`; plus `security-reviewer` for auth/PII/network/secrets; plus `silent-failure-hunter` for error paths.
4. **Verify:** `/verify`.
5. **Record:** `/journal`.
6. **Commit & push:** conventional commits; see [git-workflow.md](./git-workflow.md).

## Agentic pipeline

Each command drives a workflow in `.claude/workflows/` and is started by the owner.

- **`/feature`** (workflow `feature-analyze`) — **requirements-analyst**, **domain-checker** and (UI work) **design-checker** analyse a PRD section in parallel; the main session writes the plan and stops for owner approval.
- **`/build`** (workflow `feature-build`) — **implementer** builds one plan task at a time, **gate-checker** reports the gates, **build-error-resolver** fixes failing builds, then reviewers and **finding-verifier** check the result and `qa` runs after the last task.
- **`/qa`** (workflow `qa`) — **functional-tester**, **edge-case-hunter**, **api-tester**, **ui-tester** and **integration-tester** exercise the change; **finding-verifier** confirms findings before they block; **test-automator** lands the accepted proposals.
- **`/pr-review`** (workflow `pr-review`) — specialist reviewers and **pr-test-analyzer** fan out, **finding-verifier** confirms, **pr-reviewer** posts the G8 verdict.
- **`/bugfix`** (workflow `bugfix`) — **bug-analyst** root-causes the bug, a RED regression test is written first, then the fix.
- **`/bug`** — **bug-reporter** files a reproducible report.
- **`/retro`** (workflow `retro`) — **pm-sync** and **journal-writer** record what happened and propose prompt edits.
- **`/tidy`** and **`/worktrees`** — read-only housekeeping: expired scratch items and stale docs; stale worktrees and predicted merge conflicts.
