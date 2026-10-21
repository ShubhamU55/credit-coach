# Tech Stack Decision

**Status:** Approved 21 Oct 2026. Builds against the constraints in [PRD §9](PRD.md#9-constraints-and-deliverables-stack-agnostic).

## Decision: TypeScript end to end

| Layer | Choice | Reason |
|---|---|---|
| Mobile app | **React Native + Expo** (TypeScript), Android only | A free, sideloadable APK (EAS Build or a local build), local notifications built in, and fast iteration |
| Rules engine | **Plain TypeScript package** shared by the app and admin, with no framework or I/O | Planner, predictor and guard live in one deterministic, testable place (the TDD target). The admin can preview rule changes |
| Backend, DB and auth | **Supabase** (Postgres, Auth, row-level security, Edge Functions) | Free, no cold starts, and live data shared by the app and admin |
| Admin panel | **Next.js** on **Vercel** (free) | Fast CRUD on Supabase, Playwright-friendly |
| AI explanations | **Claude API (Haiku 4.5)** via a Supabase Edge Function | The key stays on the server, it's cheap and fast, and template text is the fallback (PRD §5.8) |
| Unit tests | **Vitest** | For the rules engine and helpers |
| Mobile E2E | **Maestro** | Android flows run locally on an emulator or device |
| Admin E2E | **Playwright** | Runs in CI |
| Repo and CI | GitHub monorepo, **pnpm workspaces**, **GitHub Actions** (lint, typecheck, unit tests, Playwright) | — |

## Auth approach
- **App:**
  - Supabase email + password. No SMS, per the PRD constraint.
  - **"Try sample profile"** uses Supabase **anonymous sign-in** and is seeded with a sample persona.
  - The bureau-linking OTP is simulated and shown on screen in demo mode.
- **Admin:** Supabase Auth, restricted to users holding an admin role.

## Rejected alternatives
- **Flutter:** strong on Android, but Dart would split the rules engine away from the TypeScript admin, so it would be written twice.
- **Native Kotlin:** too slow to build solo in 9 days.
- **Node API on Render's free tier:** roughly a minute of cold start, which judges would hit.

## Known risks and mitigations
| Risk | Mitigation |
|---|---|
| Supabase free projects pause after about 7 days without activity | A daily scheduled ping (GitHub Actions cron) through 6 Nov |
| An EAS free-tier build queue delays the APK | Fall back to a local Gradle build. Build the first APK early, not on 29 Oct |
| The LLM is slow or down during judging | Template explanations, plus a hard timeout |
| Maestro has no free CI runner | Run it locally and commit the reports and recordings to `docs/` |

## Left to the implementation plan
- Exact versions (Expo SDK, Next.js, Supabase CLI).
- Folder layout, schema and RLS policies.
- The UI component library.

## Pinned versions (installed 21 Oct 2026)
| Tool | Version | Note |
|---|---|---|
| Node | 24.16 | |
| pnpm | 12.14 | `nodeLinker: hoisted` set in `pnpm-workspace.yaml` (pnpm 12 ignores `.npmrc`). The isolated layout broke Android CMake builds through Windows path length |
| TypeScript | 6.0.3 | 7.0 is out, but typescript-eslint supports < 6.1 |
| ESLint | 9.39 | eslint-plugin-react (via eslint-config-expo) crashes on ESLint 10 |
| Vitest | 5.0 | |
| Expo SDK | 58 (expo 58.0.16) | React Native 0.88, React 19.3. Monorepo Metro config is automatic |
| Next.js | 16.4.2 | `transpilePackages: ['@credit-coach/engine']` |
| Playwright | 1.64 | Chromium only |
| Maestro | 2.11.0 | Installed in `%USERPROFILE%\.maestro\bin` |
| Gradle / AGP | 9.4.1 / 9.x | First release build ~13 min, incremental ~40 s |
