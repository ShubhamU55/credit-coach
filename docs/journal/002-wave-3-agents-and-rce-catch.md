# 002: Plan 1c Wave 3 — the remaining agents, and catching a real RCE before it shipped

- **Date:** 2026-10-27
- **PRD refs:** none (this is Plan 1c, the repo's own agentic dev system — infrastructure for building the product faster, not the product itself)
- **Plan:** docs/superpowers/plans/2026-10-21-plan-1c-agentic-system.md (Wave 3, tickets W3-1..W3-4)
- **Commits:** `3485e8c..9c719c0`

## Goal

Build the last 12 specialist agents the plan calls for (analyze-phase agents, the remaining QA testers, the bug lifecycle, PR review and ops agents) so the rest of Plan 1c's pipeline — and eventually real PRD feature work — has a full roster to run through.

## What the AI did

Four tickets, each in its own git worktree, each driven through superpowers `subagent-driven-development`: a sonnet `implementer` writes the agent files test-first where applicable, an opus (or security-reviewer/opus for the security-sensitive ticket) task reviewer checks spec compliance and quality against the task's own brief, and a scoped re-review closes each fix round before merge. The controller session ran this loop itself for all 4 tickets rather than delegating the loop to background subagents, specifically so it could rule on plan conflicts and call `AskUserQuestion` when needed — something a background subagent can't do.

Before Wave 3 started, the controller closed a carried-forward gap flagged by the prior session's dry run: `qa.workflow.js`'s tester and verifier prompts never received the plan's own text, so a tester could in principle flag plan-compliant behavior as a defect with no way to be caught — the same bug class an earlier fix (`ae9c8fc`) had already closed for the task-level build loop. Fixed test-first, five new tests, reviewed clean, landed on `main` before any Wave 3 worktree branched.

## Tests added

- Engine: unchanged (0 engine files touched this wave).
- `.claude/hooks` (Vitest): grew from 970 to 1118 tests across the wave (the pre-Wave-3 fix added 5; `bug-template.test.mjs` added for the bug issue-form template; `agents-lint.test.mjs` picked up all 12 new agent files automatically, since it reads `.claude/agents/*.md` dynamically).
- No new Maestro/Playwright tests this wave (no `apps/*` code changed).

## Review findings & fixes

Every one of the 4 tickets needed at least one fix round — none passed its first review clean. The pattern worth noting: two separate tickets (W3-2 and W3-3) failed their SPEC check for the same root cause — their agents' output field names drifted from the plan's own agent roster table, a table the controller's brief for each ticket hadn't fully quoted. By the third ticket this was caught and the pattern named explicitly in later dispatch prompts.

The one that mattered most: W3-4 (`pr-reviewer`, `pm-sync`, and two smaller agents). Round 1 fixed five Important issues the implementer itself had already found and a security reviewer confirmed with command-level evidence. Round 1's self-report flagged one residual as "only partially fixed." A dedicated security-reviewer pass on that residual **reproduced a working remote-code-execution path**: a crafted PR filename could break out of `pr-reviewer.md`'s worked-example shell script and run arbitrary code as the agent holding the GitHub token that posts the project's own merge-gate verdict — meaning a malicious pull request could, in principle, have gotten itself approved by compromising its own reviewer. A second, coupled bug (a fixed, in-repo heredoc delimiter with no collision check) made the first one exploitable in practice, not just in theory.

That finding triggered two more fix rounds, each independently re-verified by reconstructing and actually running the exploit strings in a real shell/Node harness — not just reading the diff and trusting the fix report. The final round closed a third, unrelated bug the second round's own review surfaced: a shell pipeline that kept running even after its own safety check failed, meaning the fail-closed logic the second round added couldn't actually stop anything in time. All three rounds are documented with exact reproduction commands in `docs/agent-runs/2026-10-27-plan-1c-wave-3.md`.

## Where AI was wrong / where I overrode it

- The controller's own dispatch briefs were the direct cause of 2 of the 4 tickets' SPEC failures (missing the plan's roster table). This wasn't a model mistake inside a task — it was a controller process gap, caught by the review step that exists precisely to catch it.
- An implementer's round-1 self-report on the W3-4 ticket characterized the shell-injection fix as "mostly done, two small residuals" — a dedicated security pass showed the residuals were a fully working RCE, not a polish item. The lesson: a fix round's own self-assessment of a security-relevant change is not sufficient evidence on its own; an independent, adversarial review with real reproduction is what actually closed the gap, twice.
- Two background implementer agents were interrupted mid-task by infrastructure issues (a rate limit, then a session-boundary process teardown) and left real, substantial uncommitted work behind. Rather than discard and restart, the controller read the diffs in full, confirmed no other session was concurrently touching the same worktree, and built on the existing work — the same recovery pattern a prior wave (W1-4) had already established.

## What I learned

- Any ticket that defines new agent output fields needs the plan's own roster table quoted directly into its brief, not just the spec's model-tier table — these two tables don't always agree on exact field names, and only the plan's is binding.
- A security review of generated procedural text (markdown instructions an LLM agent will execute as shell commands) deserves the same reproduction-based rigor as a review of real source code — "the fix should work" is not evidence; running the actual exploit string against the actual committed text is.
- When a background agent is interrupted, the right first move is to read what it left behind before deciding whether to reset it — twice this wave, the leftover work was further along and more correct than a fresh restart would have produced.

## Time spent

Roughly one extended session (spanning a session-boundary interruption), covering 4 parallel-worktree tickets, 3 fix rounds on the hardest one, and one dedicated security-reproduction pass.
