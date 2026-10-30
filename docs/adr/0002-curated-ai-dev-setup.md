# ADR 0002: A curated, project-owned AI dev setup (not a fork or full ECC install)

- **Status:** Accepted, 21 Oct 2026

## Context

- Judging weighs how AI was used in development.
- [affaan-m/ECC](https://github.com/affaan-m/ECC) is a large Claude Code plugin with a proven plan → test → review → learn loop: about 71 agents, 311 skills and 97 commands.
- The owner already uses the superpowers plugin.

## Options

1. **Fork or clone ECC as the repo.** Rejected:
   - the app gets buried under hundreds of unrelated skills
   - judges can't tell what's ours
2. **Install ECC as a plugin unchanged.** Rejected:
   - about 311 skill descriptions bloat the context
   - names collide with built-ins and superpowers (`code-review`, `security-review`)
   - default hooks slow a sprint: GateGuard on every first edit, a type-check of up to 300 s on every stop
   - nothing visible ends up in the repo
3. **A curated subset, copied into `.claude/` and adapted, plus our own pieces.** Accepted.

## Decision

- **From ECC (MIT, attributed on each file's first line):**
  - 7 agents: planner, code-reviewer, typescript-reviewer, react-reviewer, security-reviewer, silent-failure-hunter, tdd-guide
  - rules: common, typescript, react-native
  - 9 skills; `security-review` renamed to `app-security-review`
- **Changes made while adapting:**
  - auto-firing "MUST BE USED / PROACTIVELY" phrasing removed
  - coverage target changed to "engine ≥ 90% lines; apps via E2E"
- **Our own pieces:**
  - skills: `credit-domain`, `maestro-android-e2e`, `process-journal`
  - hooks: `protect-env`, `format-on-edit`
  - commands: `/feature`, `/verify`, `/journal`
- **Ownership:** superpowers owns brainstorm, plan, TDD and execution; ECC agents own specialist review. One owner per phase.

## Consequences

- The setup is versioned, reviewable and visible to judges.
- Upstream ECC improvements don't flow in automatically. Acceptable for a one-month project.

## Amendment, 27 Oct 2026: what the setup has grown into

The decision above still holds. Two things changed.

### Our own pieces have grown

The commands (`/build`, `/qa`, `/pr-review`, `/bugfix`, `/bug`, `/retro`, `/tidy`, `/worktrees`), the workflows in `.claude/workflows/` and most of the agents in `.claude/agents/` are written for this project, not adapted from ECC. `.claude/commands/`, `.claude/workflows/` and `.claude/agents/` are the current lists; this ADR does not repeat them.

### Plugin inventory

A plugin runs code and may open network connections, so each one needs an owner, a scope and a recorded version. Adding a plugin means adding a row here in the same pull request; a test fails when a plugin is enabled in any `settings.json` without one.

| Plugin                         | Purpose                                                                              | Scope                                                                                                                                                                                                                                                                                                                 | Version                                                                                                                                                      | Pin                                                                                                                                                                                                                    | Executable parts                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expo@claude-plugins-official` | Expo skills (Router, EAS, upgrades, debugging) for `apps/mobile`. Owner: repo owner. | Enabled in `apps/mobile/.claude/settings.json`, which, per the Claude Code docs, is read only when a session starts in `apps/mobile`; a session started at the repo root should not see it. Enabling does not install it: each contributor runs `claude plugin install expo@claude-plugins-official --scope project`. | 1.13.9, from `expo/skills` (MIT), `plugins/expo` at commit `d4f484024fec15196bfd3c272e953e3f983972cf`, as listed by the official marketplace on 27 Oct 2026. | Plugin: commit-pinned by the marketplace entry. Marketplace: unpinned. It publishes no tags, and Claude Code documents no commit pin for a marketplace source, so `claude-plugins-official` tracks its default branch. | Two hooks (`PostToolUse` on `Skill`, `UserPromptExpansion`) run `skill-event.cjs`, which sends usage events to PostHog (`us.i.posthog.com`) only if telemetry is switched on; it is off by default and `DO_NOT_TRACK=1` forces it off. An HTTP MCP server, `https://mcp.expo.dev/mcp`, is declared in `.mcp.json`. |

How this was reviewed: the plugin manifest, its hooks file, its MCP config and its two telemetry scripts were read at the recorded commit. The skills' own markdown was not read line by line.

Rules that follow from the inventory:

- Telemetry stays off. Nobody runs the plugin's `telemetry.cjs --on`, and `DO_NOT_TRACK=1` is the safe default for anyone working on this repo.
- The `expo` MCP server is the only remote MCP connection in the project and talks to a third party. No PAN, no real income or card figures and no secret goes into a prompt that uses it. The demo data is synthetic. Since 30 Oct 2026, `apps/mobile/.claude/settings.json` puts the whole server (`mcp__plugin_expo_expo`) in `permissions.ask`, so every call prompts the owner.
- Updating the plugin means changing the recorded commit and re-reading the hooks and MCP config at the new commit.
