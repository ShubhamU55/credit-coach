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
