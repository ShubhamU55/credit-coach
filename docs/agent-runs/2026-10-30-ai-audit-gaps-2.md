---
purpose: Run ledger for the second AI-workflow audit fix round (30 Oct 2026), split into four PRs
run: 2026-10-30, main session as controller (Opus), by hand per the CLAUDE.md fallback (config and docs work, no PRD section); advisor review of the fix plan; /pr-review per PR
---

# AI-workflow audit fixes, round 2 (PRs #73, #74, #75 and part 4)

## Why

The 30 Oct 2026 audit (`ai-audit/credit-coach-2026-10-30.md`, rubric 2.0) scored 4.10/5 (82%, "Managed"), up from 73% on 27 Oct. Git & Review (P9) is capped at 2 until 25 Jan 2027, because AI configuration was committed directly to `main` before branch protection. No fix lifts that cap, so this round targets the other parameters: projected 4.85/5 (97%).

## What the audit got wrong

The audit's `gh` session used the owner's non-admin work account. With the `ShubhamU55` token, the controller found:

- classic branch protection on `main` already requires a PR, an up-to-date branch, 12 checks (including `pr-body` and `pr-review`) and admin enforcement;
- secret scanning and push protection are on.

The PRs record both in the repo, so a non-admin reader can see them.

## What changed

| Part | PR                                                                                                                                                                                                | Audit items                                                                              | Lines                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| 1    | #74 `.claude/rules/typescript.md` rewritten from generic ECC text to project rules                                                                                                                | P7 7.7                                                                                   | +44 −209                 |
| 2    | #75 `.claude/rules/react-native.md` rewritten the same way                                                                                                                                        | P7 7.7                                                                                   | +39 −204                 |
| 3    | #73 command scoping and check steps, pre-commit gitleaks hook, `.devcontainer/` sandbox and egress allowlist, policy and cost docs, `ai-assisted` label                                           | P1 1.5, P2 2.7 2.9, P4 4.8, P5 5.9 5.10, P6 6.8, P10 10.2 10.8 10.14, P11 11.1 11.2 11.4 | +372 −21                 |
| 4    | part 4 (owner-applied): `gh pr merge` asks, telemetry `env`, `cleanupPeriodDays: 30`, Expo MCP asks, `config-protection.cjs` asks before edits to instruction files, PR-size warning, this ledger | P3 3.6, P4 4.5, P6 6.8, P9 9.6, P10 10.14, P11 11.1                                      | +146 −4 plus this ledger |

## Rulings (controller)

- Ruling: rank fixes by the points they can score now, and treat the P9 items as risk reduction only. Cost if wrong: none, because the cap is in the rubric.
- Ruling: don't add a one-approval rule. GitHub blocks self-approval on a one-maintainer repo with admin enforcement, so the owner couldn't merge on submission day. Cost if wrong: P9 9.3 stays failed after the cap lifts, until a second reviewer exists.
- Ruling: name the backup owner in `docs/ai-policy.md` by name only. The repo is public, the owner's message gave a work email, and the person isn't a collaborator yet, so CODEOWNERS waits for their GitHub handle. Cost if wrong: 10.2 stays Partial until the handle is added.
- Ruling: put the Claude Code sandbox in the dev container's managed settings, not in `.claude/settings.json`. The sandbox can't start on native Windows, and enabling it at project level risks breaking every host session. Cost if wrong: an auditor who looks only at `.claude/settings.json` misses it; the policy and checklist point to it.
- Ruling: don't pin the Expo plugin's marketplace. Claude Code's marketplace `ref` takes a branch name, `expo/skills` has no tags, and a SHA `ref` couldn't be tested without changing the owner's user config. Least privilege comes from an `ask` rule on the remote MCP server instead. Cost if wrong: P3 3.4 stays Partial.
- Ruling: use a plain `.githooks/` hook installed by `prepare`, not lefthook or pre-commit, so no new dependency is added. Cost if wrong: none; the check is the same gitleaks command.
- Ruling: `config-protection.cjs` asks rather than blocks for instruction files, because `/retro` applies owner-approved prompt edits and a block would stop it. Cost if wrong: an owner who approves prompts without reading lets a bad edit through.

## Where the AI was wrong

- The controller's first `/bug` check step called `gh issue view`. The existing test `/bug runs no gh call itself` caught it in `pnpm verify`, and the step now checks the Workflow result and the committed evidence with git.
- The controller's first PR 3 commit subject was 76 characters. The commit-quality hook blocked it.
- An attempt to update ruleset 26139084 through the API was blocked by the session's auto-mode classifier as a shared-resource change. It is an owner step (below).

## Owner steps

1. Apply part 4 (`git apply`), read the diff, and commit it on its branch.
2. Mirror the PR rule and the `pr-body`/`pr-review` checks into ruleset 26139084.
3. Install gitleaks 8.19+ and run `pnpm install` so the pre-commit hook is active.
4. Start Docker Desktop, rebuild the dev container once, and check the firewall line in the start log.
5. Start the collector: `docker compose -f scripts/otel/compose.yaml up -d`.
6. Run `/pr-review` on each PR, then merge in order 1, 2, 3, 4.
7. Re-run the audit with `gh auth switch --user ShubhamU55` active.
