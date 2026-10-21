# Credit Coach: agent guide

**What we're building:** an Android app (plus a web admin control center) that tells people in India **what to pay, where, and when** each month to protect their CIBIL score. Solo hackathon build. Submission is due **30 Oct 2026 EOD**. Judges weigh *how AI was used to build it* as much as the product.

## Start here
- **`docs/status.md`** is the session handoff log: current state, blockers, next step. Read it first, and update it at the end of every session.

## Source of truth
- **`docs/PRD.md`** (frozen v1) holds the requirements. Read the relevant section before any feature work. If code and PRD disagree, the PRD wins. Raise the conflict; don't silently pick one.
- **PRD §4** lists the domain facts F1–F7. The **`credit-domain` skill** expands them. Never contradict them.
- **`docs/design.md`** (v3 "Midnight") is the **UI design guide for the mobile app**: tokens, components, screens, copy, accessibility and the demo fixture. Read it before building any screen. For mobile visuals it supersedes `.design/`; for requirements, the PRD wins.
- `docs/tech-stack.md` is the stack and its risks. `docs/adr/` holds the decisions. `docs/superpowers/plans/` holds the implementation plans.

## Workflow (Think → Build → Test → Review → Learn)
For every feature, use `/feature <PRD section>`:
1. Read the PRD section and the `credit-domain` skill.
2. Plan: superpowers `writing-plans` (the ECC `planner` agent is an optional second opinion).
3. Build test-first: superpowers `test-driven-development`.
4. Review: `typescript-reviewer`; plus `react-reviewer` for `.tsx`; plus `security-reviewer` when auth, PII, network or secrets are touched; `silent-failure-hunter` for error paths.
5. Verify: `/verify`.
6. Record: `/journal`, which adds an entry in `docs/journal/`. This is evidence for the judges, so don't skip it.

## Who owns what
| Phase | Owner |
|---|---|
| Brainstorm, plans, TDD, execution, verification | superpowers plugin (user-level) |
| Specialist review | `.claude/agents/`: code-reviewer, typescript-reviewer, react-reviewer, security-reviewer, silent-failure-hunter, tdd-guide, planner (adapted from affaan-m/ECC) |
| Domain knowledge | `credit-domain` skill |
| Android E2E | `maestro-android-e2e` skill |
| Admin E2E | `e2e-testing` skill (Playwright) |
| Process evidence | `process-journal` skill and `/journal` |

## Repo map
| Path | What |
|---|---|
| `packages/engine` | **Pure** TypeScript rules engine: utilization, planner, reporting dates, predictor, guard |
| `apps/mobile` | Expo / React Native Android app (`com.creditcoach.app`) |
| `apps/admin` | Next.js admin control center (Playwright tests in `e2e/`) |
| `supabase/` | Migrations, seed and Edge Functions (hosted project, CLI-managed) |
| `.claude/` | Agents, skills, rules, hooks and commands for this project |
| `docs/` | PRD, tech stack, ADRs, plans, journal, test reports |

## Commands
- `pnpm verify` runs lint, typecheck and unit tests for every workspace, failing fast.
- `pnpm --filter @credit-coach/engine test` runs the engine unit tests.
- `pnpm --filter @credit-coach/admin test:e2e` runs the Playwright tests (it builds and starts Next).
- `pnpm --filter @credit-coach/mobile android:release` builds and installs a standalone release APK on the running emulator or device.
- `pnpm --filter @credit-coach/mobile e2e` runs the Maestro flows in `apps/mobile/.maestro/`. Stop Metro first.
- Inside `apps/mobile`, use `npx expo install <pkg>`, not `pnpm add`. It picks SDK-compatible versions.

## Non-negotiables
1. **The engine is pure.** No I/O, no network, no `Date.now()` or `new Date()` without arguments. "Today" and all config are passed in. Same inputs, same outputs.
2. **The LLM never computes** amounts, dates or scores. It only words results the engine already computed. A template fallback always exists.
3. **Never show an exact predicted score.** Always a range plus reasons, clamped to 300–900, labelled as an estimate.
4. **Never advise closing a card** without warning about credit age and limit loss.
5. **PAN is never stored or logged in full.** Mask it in the UI (`ABXXXXX34F`). Record consent with a timestamp.
6. **No secrets in the repo.** Only `.env.example` is committed. Agents cannot write `.env*` files (a hook blocks it); ask the owner to fill them in. The Anthropic key lives only in Supabase Edge Function secrets.
7. **Commits and PRs carry no AI co-author or "Generated with" lines.** Use conventional commits.
8. **The demo path must work unaided:** "Try sample profile" with no sign-up, an on-screen demo OTP, and no SMS.
9. `docs/design.md` and `.design/` are owned by the design workflow. Read them for UI work, but don't modify them unless asked.

## Framework notes
- `apps/admin/AGENTS.md` (Next 16) and `apps/mobile/AGENTS.md` (Expo SDK 58) warn that these versions differ from training data. Read the bundled or versioned docs before using a framework API.
