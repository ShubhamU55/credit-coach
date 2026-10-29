# ADR 0004: Index the repo and trim MCP servers now; defer RTK; reject Caveman and Pi

- **Status:** Accepted, 28 Oct 2026
- **Related:** [ADR 0002](0002-curated-ai-dev-setup.md), [ADR 0003](0003-agentic-delivery-system.md), [`docs/ai-system.md`](../ai-system.md).

## Context

- The owner wants more work per token. Sessions fill the context window, plan usage limits get hit, and judges weigh how AI was used.
- Submission is due 30 Oct 2026, so only low-risk changes are acceptable before then.

## Options

1. **RTK (Rust Token Killer, [rtk-ai/rtk](https://github.com/rtk-ai/rtk)).** A CLI proxy. A PreToolUse hook rewrites Bash commands (`git status` becomes `rtk git status`) and compresses their output. **Deferred until after submission**, with a trial in an isolated worktree. Reasons:
   - `gate-checker` (`.claude/agents/gate-checker.md`) builds `GATE_FACTS` by parsing raw git and test output, which RTK rewrites. The drift guard could misread `dirtyFiles` or test results.
   - `rtk init -g` installs the hook globally, which would affect the owner's other projects.
   - It hooks only the Bash tool, while PowerShell is this machine's primary shell (open upstream request [rtk-ai/rtk#1319](https://goodfirstissue.org/rtk-ai/rtk/issues/1319)).
   - Its interaction with the existing Bash PreToolUse hooks (`block-no-verify`, `pre-bash-commit-quality`) and the `git push --force*` deny rules is unverified.
2. **Caveman (JuliusBrussee/caveman, a Claude Code skill/plugin).** Makes Claude reply in a terse, telegraphic style. **Rejected.**
   - It only affects output. Independent tests measured roughly 12-25% less output, which is about 1-3% of total usage.
   - It does not address the context filling up.
   - It would degrade the judge-facing records: the journal, run ledgers, ADRs and subagent reports.
   - Its `caveman-compress` rewrite of `CLAUDE.md` conflicts with the owner-owned rule docs.
3. **Pi (pi.dev, badlogic/pi-mono).** A separate coding-agent harness, not an add-on. **Rejected.** It ships without MCP, subagents or permission gates by design. The project's Workflows, 26 agents and hooks (ADR 0003) depend on all three.

## Decision

Adopted now:

1. **Index this repo in codebase-memory-mcp.**
   - The user-level `cbm-code-discovery-gate` hook prefers graph queries for code discovery. Without an index it falls back to reading files.
   - `index_repository` (mode `full`) created the project `C-Users-55-credit-coach`: 1257 nodes and 1345 edges, status `ready`. `get_architecture` returned real results (engine functions such as `utilization`, `formatINR` and `maskPan`, and the mobile, admin and engine boundaries).
   - The tool excludes `.claude/`, `.git/`, `node_modules` and build output, so agents, workflows and hooks are not in the graph. Most nodes are markdown sections, and the graph holds only 19 functions. It helps most for locating engine code and docs.
2. **Disable MCP servers unrelated to this project, for the credit-coach project only:** odoo, qmetry, chrome-devtools-cypress, chrome-devtools-mcp, github-actions-cypress, postman and the claude.ai Rovo connector. The owner did this through `/mcp`. Claude Code stores the setting per project path, and it keeps separate entries for `c:/` and `C:/`. If the servers reappear in a session, disable them again in that session.
   - It is reversible and leaves other projects untouched.
   - MCP tools are deferred, so this saves tool-name lists and server instructions, not full schemas.
   - Workflow agents declare explicit `tools:` lists, so the main session benefits most.
   - Disabling postman also removes a 30 s connect timeout at every session start.
3. **Keep the existing model tiering** as the main token lever already in place (from `model:` in `.claude/agents/*.md`):
   - haiku: `gate-checker`, `journal-writer`, `pm-sync`, `bug-reporter`
   - opus: `planner`, `pr-reviewer`
   - sonnet: the other 20 agents

## Measurement

Measured with `/context` on fresh sessions in this repo (1M window). Before: the servers enabled, except Rovo (claude-opus-5-5). After: the servers disabled (claude-sonnet-5-5).

| Category                         | Before         | After          | Controllable here?                                    |
| -------------------------------- | -------------- | -------------- | ----------------------------------------------------- |
| System tools                     | 19.9k          | 20.1k          | No (built-in)                                         |
| Skills                           | 9.1k           | 9.1k           | Partly (user-level and plugin skills, see follow-ups) |
| Memory files (CLAUDE.md + rules) | 7.7k           | 7.7k           | Yes (trimmed in 63db2d2)                              |
| System prompt                    | 3.5k           | 3.5k           | No                                                    |
| Custom agents                    | 2.7k           | 2.7k           | Yes (agent descriptions)                              |
| Messages                         | 1.6k           | 1.6k           | n/a                                                   |
| MCP tools + server instructions  | 1.4k (630+782) | 1.4k (640+717) | Yes (this decision)                                   |
| **Total**                        | **46.0k (5%)** | **46.1k (5%)** |                                                       |

Disabling the servers saved no measurable tokens. MCP tool schemas are deferred and load only when used, so idle servers cost almost nothing at startup. The real gains are a session start about 30 s faster (no postman connect timeout) and fewer unrelated tools for the model to choose between.

A fresh session starts with 46.1k tokens, about 5% of the window. Startup overhead is therefore not what fills the context. Context fills during a session, from tool output and file reads. That is where the graph index helps now, and where RTK might help later. The workflow's existing habit of delegating work to subagents also keeps file dumps out of the main session.

## Consequences

- **Positive**
  - No change to hooks, agents or workflows, so there is no risk to the gates before 30 Oct.
  - Code discovery can use the graph instead of reading files.
  - Sessions start about 30 s faster without the postman timeout, and the model has fewer unrelated tools to choose from.
  - The records judges read keep their full wording.
- **Negative**
  - MCP trimming saved no measurable tokens (1.4k before and after); its value is startup time, not context.
  - The graph is shallow: this repo has few functions so far, and `.claude/` is excluded. It must be re-indexed as code grows.
  - No token saving on shell output until RTK is tried.
- **Follow-ups**
  - After 30 Oct, trial RTK in a worktree with a project-scoped hook rather than `rtk init -g`. Check `gate-checker` output against raw output, hook ordering with `block-no-verify` and `pre-bash-commit-quality`, and the force-push deny rules.
  - Skills (9.1k) are the largest remaining controllable startup cost. They include user-level skills for unrelated projects. Review them after submission.
  - Re-measure and record the results in the table above.

## Addendum: on-demand loading (28 Oct 2026)

- **Stale rule files, already fixed on `main`.** `.claude/rules/agents.md` and `.claude/rules/development-workflow.md` have no `paths:` front matter, so every session and every subagent loads them. On the branch this ADR started from, both still called the workflows and a dozen built agents "planned, not yet built". `main` has since rewritten both accurately, and those rewrites are kept as they are. `rules-scope.test.mjs` now fails if a "not yet built" or "planned roster" claim comes back, and it pins the Delegation Completion Contract.
- **Commands.** The owner starts every command (`CLAUDE.md`). `main` already blocks the model from starting the six write commands (`build`, `bug`, `bugfix`, `feature`, `journal`, `pr-review`; `commands-frontmatter.test.mjs`). This change also sets `disable-model-invocation: true` on the four read-only ones (`qa`, `retro`, `tidy`, `worktrees`), so no command description except `/verify`'s sits in context. `/verify` stays invocable because the model runs it before every commit. `commands-invocation.test.mjs` pins that every command except `/verify` is owner-only.
- **Numbers.** The four newly owner-only descriptions total 730 characters, about 180 tokens, plus their names and argument hints. The two rule files stay at 94 lines (10,850 characters, about 2.7k tokens). Shortening them further would need a separate decision, because `main`'s versions are a deliberate index of the agents.
- **Per-agent repeat.** Subagents also load project memory and rules, so any saving in the always-loaded rules repeats for every agent a workflow spawns.

## Sources

- <https://github.com/rtk-ai/rtk>
- <https://goodfirstissue.org/rtk-ai/rtk/issues/1319>
- <https://www.implicator.ai/caveman-claude-code-skill-cuts-output-20-your-bill-barely-notices-2/>
- <https://urandom.io/blog/2026-03-07-pi-dev-deep-dive>
