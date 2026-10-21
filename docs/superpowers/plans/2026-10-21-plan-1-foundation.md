# Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monorepo where every toolchain is proven end to end, plus a project-owned AI dev setup, so feature work from 24 Oct can start on solid ground.

What "every toolchain proven" means:
- the engine runs unit tests
- the admin runs Playwright
- the mobile app builds a standalone APK that passes a Maestro flow
- the Supabase project is linked
- CI is green

**Architecture:** pnpm workspace with `packages/engine` (pure TypeScript), `apps/mobile` (Expo), `apps/admin` (Next.js) and `supabase/` (hosted project, CLI-managed). The AI dev setup lives in `CLAUDE.md` and `.claude/`. It holds ECC pieces we picked and adapted (MIT, credited) plus custom skills, hooks and commands. Superpowers (user-level plugin) owns brainstorm → plan → TDD → execution. The ECC pieces cover specialist roles.

**Tech Stack:** pnpm, TypeScript, Vitest, Expo / React Native, Next.js, Playwright, Maestro, Supabase CLI, GitHub Actions, gitleaks.

**Spec:** [docs/PRD.md](../../PRD.md) (frozen v1) and [docs/tech-stack.md](../../tech-stack.md).

**Plan series** (each is its own plan, written when its predecessor is done):
1. **Foundation** (this plan), due 23 Oct
2. Rules engine: planner, reporting dates, predictor, guard (TDD, `packages/engine`)
3. Backend: Supabase schema, RLS, seed personas, demo bureau provider, explanation Edge Function, keep-alive cron
4. Mobile app: PRD §5.1–5.8 screens; core green by 27 Oct
5. Admin control center: PRD §6, on 28 Oct if core is green

**If 23 Oct slips:**
- **Tasks 1–5 must stay**, because they remove the toolchain risk.
- **Tasks 6–7 can shrink** to `CLAUDE.md`, the `credit-domain` skill, the three reviewer agents (code, typescript, security) and the `protect-env` hook. The remaining ECC adaptations land during Plans 2–4.
- **Plan 2 depends only on Task 2**, so it can start without waiting for the mobile, Supabase or CI work.

## Global Constraints

- Dev machine: **Windows 11**. All scripts, including hook scripts, must work in PowerShell and Git Bash. Write scripts in Node (`.mjs`), not bash.
- Node **LTS ≥ 20**, **pnpm ≥ 9**. The root `.npmrc` must contain `node-linker=hoisted`, because Expo/Metro needs a hoisted `node_modules` in a pnpm monorepo.
- Android application id: **`com.creditcoach.app`**. Display name: **"Credit Coach"**.
- **Never commit secrets.** Only `.env.example` files are committed. The Anthropic key lives only in Supabase Edge Function secrets, never in app or admin env.
- **Commit messages carry no AI co-author or "Generated with" lines** (owner's standing rule). Use conventional commits (`feat:`, `chore:`, `test:`, `docs:`, `ci:`).
- **Agents cannot write `.env*` files** (the Task 7 hook blocks it by design). The **owner** copies `.env.example` → `.env.local` and fills in values by hand. Executors must ask the owner rather than work around the hook (e.g. via Bash). The README says so.
- Copied ECC files keep a first-line attribution comment, `<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->`. `THIRD_PARTY_NOTICES.md` reproduces ECC's MIT license.
- ECC source for copying: the local clone at `C:\Users\55\AppData\Local\Temp\claude\C--Users-55\0c8b837c-b945-411d-969a-049e4d8d584f\scratchpad\ecc`. If it's missing, re-clone `https://github.com/affaan-m/ECC` and use commit `90606c8`.
- The docs folder `docs/` is the agents' reference. `CLAUDE.md` must point to `docs/PRD.md` as the source of truth.

## Review Focus

1. **Metro can't resolve the workspace package `@credit-coach/engine` from `apps/mobile`.** It should import and render. The Task 4 smoke screen renders a value computed by the engine, and the Maestro flow asserts that value.
2. **The APK only works with a dev server running** (debug build). A judge's phone has no Metro. Task 4 builds a release-variant APK and runs Maestro against it with Metro stopped.
3. **A `.env` file or key gets committed.** Task 5's CI runs gitleaks. Task 7's hook blocks agent writes to `.env*` except `.env.example`, with unit tests for both cases.
4. **The hook breaks on Windows paths** (backslashes, drive letters, mixed case `.ENV`). Task 7's `isProtectedPath` tests include `C:\\repo\\apps\\admin\\.env.local` and `apps/mobile/.ENV`.
5. **The format-on-edit hook slows or fails every edit** (e.g. on a non-JS file, or when prettier isn't installed yet). Task 7 tests that `.md` and `.yaml` are skipped or formatted without error, and that the hook exits 0 when prettier is missing.

---

### Task 0: Accounts and machine prerequisites (owner, manual)

**Files:** none

- [ ] **Step 1: Confirm the installed tools** with `node -v` (≥ 20), `pnpm -v` (≥ 9), `git --version`, `gh auth status`, `java -version` (17), `adb version` (Android SDK platform-tools), an Android emulator (API 34+) created in Android Studio, and `maestro --version` (Windows zip install, on PATH).
- [ ] **Step 2: Create the accounts:**
  - GitHub repo access via `gh`
  - **Supabase** (free): create project `credit-coach`, region Mumbai (`ap-south-1`)
  - **Vercel** (free), linked to GitHub
  - **Expo** (free), for EAS
  - **Anthropic API key**
- [ ] **Step 3: Record the project ref, URL and anon key** somewhere private, not in the repo.

Expected: every command prints a version; all accounts exist.

---

### Task 1: Repo and workspace skeleton

**Files:**
- Create: `.gitignore`, `.npmrc`, `.editorconfig`, `.prettierrc.json`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `README.md`, `LICENSE` (MIT, owner), `THIRD_PARTY_NOTICES.md`
- Keep: `docs/PRD.md`, `docs/tech-stack.md`, `docs/superpowers/plans/*`

**Interfaces:**
- Produces: root scripts `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm verify` (runs lint → typecheck → test, failing fast).
- Produces: workspace globs `apps/*` and `packages/*`.

- [ ] **Step 1:** `git init -b main` in `C:\Users\55\credit-coach`.
- [ ] **Step 2: Write the config files.**
  - `.gitignore` covers `node_modules`, `.env*` (with `!.env.example`), `.expo`, `android/`, `ios/`, `.next`, `playwright-report`, `test-results`, `coverage`, `*.apk`, `supabase/.temp`.
  - `.npmrc` contains `node-linker=hoisted`.
  - `.editorconfig` sets `end_of_line = lf`.
  - `.gitattributes` contains `* text=auto eol=lf`.
- [ ] **Step 3: Write the root `package.json`** (`"private": true`, `packageManager` pinned to the installed pnpm) with the scripts above, delegating via `pnpm -r --if-present <script>`. Add `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`) and the ESLint flat config with typescript-eslint.
- [ ] **Step 4:** Run `pnpm install` then `pnpm verify`. Expected: exit 0. There are no packages yet, so every step is a no-op.
- [ ] **Step 5: Write `README.md`** with a one-paragraph pitch from PRD §1, a placeholder "Run locally" section, and links to `docs/`. Write `THIRD_PARTY_NOTICES.md` with ECC's MIT text.
- [ ] **Step 6: Commit** `chore: initialise pnpm monorepo with PRD and tech-stack docs`.

---

### Task 2: `packages/engine` with Vitest, proven by a real PRD function

**Files:**
- Create: `packages/engine/package.json` (name `@credit-coach/engine`, `"main": "src/index.ts"`, `"types": "src/index.ts"`), `packages/engine/tsconfig.json`, `packages/engine/vitest.config.ts`, `packages/engine/src/index.ts`, `packages/engine/src/utilization.ts`
- Test: `packages/engine/src/utilization.test.ts`

**Interfaces:**
- Produces:
  - `utilization(outstanding: number, limit: number): number | null`, a percentage rounded to 1 decimal place. Returns `null` when `limit <= 0` or the limit isn't finite (PRD §5.2: such cards are excluded and flagged).
  - `overallUtilization(cards: ReadonlyArray<{ outstanding: number; limit: number }>): number | null` = Σ outstanding ÷ Σ limit over cards with a valid limit, rounded to 1 dp. Returns `null` if no card is valid.
  - Both are exported from `@credit-coach/engine`.
- Package scripts: `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `lint`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { utilization, overallUtilization } from './utilization';

describe('utilization', () => {
  it('computes percent to 1 dp', () => {
    expect(utilization(4500, 15000)).toBe(30.0);
    expect(utilization(1, 3)).toBe(33.3);
    expect(utilization(0, 50000)).toBe(0);
  });
  it('returns null for zero, negative or non-finite limit', () => {
    expect(utilization(100, 0)).toBeNull();
    expect(utilization(100, -5)).toBeNull();
    expect(utilization(100, Number.NaN)).toBeNull();
  });
});

describe('overallUtilization', () => {
  it('sums across valid cards and excludes invalid limits', () => {
    expect(overallUtilization([
      { outstanding: 12000, limit: 15000 },
      { outstanding: 3000, limit: 45000 },
      { outstanding: 999, limit: 0 },
    ])).toBe(25.0);
  });
  it('returns null when no card has a valid limit', () => {
    expect(overallUtilization([{ outstanding: 10, limit: 0 }])).toBeNull();
    expect(overallUtilization([])).toBeNull();
  });
});
```

- [ ] **Step 2:** `pnpm --filter @credit-coach/engine test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement both functions in `src/utilization.ts` and re-export them from `src/index.ts`.
- [ ] **Step 4:** `pnpm verify`. Expected: PASS, 4 tests.
- [ ] **Step 5: Commit** `feat(engine): add utilization helpers with tests`.

---

### Task 3: `apps/admin` (Next.js) with a Playwright smoke test

**Files:**
- Create: `apps/admin/` via `pnpm create next-app@latest apps/admin --ts --app --eslint --src-dir --no-tailwind --import-alias "@/*" --use-pnpm` (Tailwind optional, builder's call)
- Modify: `apps/admin/src/app/page.tsx`
- Create: `apps/admin/playwright.config.ts`, `apps/admin/e2e/smoke.spec.ts`, `apps/admin/.env.example`

**Interfaces:**
- Consumes: `utilization` from `@credit-coach/engine` (adds `"@credit-coach/engine": "workspace:*"`; Next needs `transpilePackages: ['@credit-coach/engine']`).
- Produces:
  - Package name `@credit-coach/admin`
  - Scripts `dev`, `build`, `lint`, `typecheck`, `test:e2e`
  - `.env.example` keys `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 1: Write the failing test** `e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
test('admin home renders title and engine-backed value', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Credit Coach Admin' })).toBeVisible();
  await expect(page.getByTestId('engine-check')).toHaveText('Engine OK: 30%');
});
```

- [ ] **Step 2: Configure Playwright and run it.** Use `playwright.config.ts` with `webServer: { command: 'pnpm build && pnpm start', port: 3000 }`, Chromium only. Run `pnpm --filter @credit-coach/admin test:e2e`. Expected: FAIL (heading not found).
- [ ] **Step 3: Update the page.** `page.tsx` renders `<h1>Credit Coach Admin</h1>` and `<p data-testid="engine-check">Engine OK: {utilization(4500, 15000)}%</p>`.
- [ ] **Step 4:** Run `test:e2e` again. Expected: PASS. Run `pnpm verify`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): scaffold Next.js admin with Playwright smoke test`.

---

### Task 4: `apps/mobile` (Expo) with a standalone APK and a Maestro smoke flow

**Files:**
- Create: `apps/mobile/` via `pnpm create expo-app@latest apps/mobile --template blank-typescript`
- Modify: `apps/mobile/app.json`, `apps/mobile/App.tsx`, `apps/mobile/package.json`
- `apps/mobile/metro.config.js`: **read Expo's current monorepo guide first.** Recent SDKs configure monorepos automatically and advise against manual `watchFolders`/`nodeModulesPaths`. Start from Expo's default config, and add overrides only if Step 5 can't resolve `@credit-coach/engine`.
- Create: `apps/mobile/eas.json`, `apps/mobile/.maestro/smoke.yaml`, `apps/mobile/.env.example`

**Interfaces:**
- Consumes: `utilization` from `@credit-coach/engine` (`workspace:*`).
- Produces:
  - Package name `@credit-coach/mobile`
  - Scripts `start`, `android:release` (`expo run:android --variant release`), `e2e` (`maestro test .maestro`), `typecheck`, `lint`
  - `eas.json` profile `preview` with `android.buildType: "apk"`
  - `.env.example` keys `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 1: Set the app identity.** In `app.json`: `name: "Credit Coach"`, `slug: "credit-coach"`, `android.package: "com.creditcoach.app"`.
- [ ] **Step 2: Write the failing flow** `.maestro/smoke.yaml`:

```yaml
appId: com.creditcoach.app
---
- launchApp:
    clearState: true
- assertVisible: "Credit Coach"
- assertVisible:
    id: "engine-check"
    text: "Engine OK: 30%"
```

- [ ] **Step 3: Implement the screen.** `App.tsx` renders the text "Credit Coach" and `<Text testID="engine-check">Engine OK: {utilization(4500, 15000)}%</Text>`.
- [ ] **Step 4: Build and install the release APK** with the emulator running: `pnpm --filter @credit-coach/mobile android:release`. Expected: the build succeeds and the app opens showing both texts.
- [ ] **Step 5: Stop Metro and run Maestro.** Stop any Metro/dev server, then run `pnpm --filter @credit-coach/mobile e2e`. Expected: `smoke.yaml` PASSED. This proves the APK is standalone (Review Focus 2) and that the workspace import resolves (Review Focus 1).
- [ ] **Step 6: Prove the cloud build path once** (owner logged in to Expo): `cd apps/mobile && npx eas-cli build -p android --profile preview`. Expected: an APK download URL. Install it on a physical phone, open it, and confirm "Engine OK: 30%". If the EAS queue is too slow, record that in the journal and rely on the local `android:release` APK.
- [ ] **Step 7: Record versions.** Add the Expo SDK, React Native, Next.js and Playwright versions to `docs/tech-stack.md` under "Pinned versions".
- [ ] **Step 8: Commit** `feat(mobile): scaffold Expo app with release APK and Maestro smoke flow`.

---

### Task 5: Supabase link, GitHub repo and CI

**Files:**
- Create: `supabase/` via `npx supabase init` (`supabase/config.toml`, `supabase/migrations/`), `.github/workflows/ci.yml`, `.gitleaks.toml` (default rules)
- Modify: `README.md` (setup steps), root `package.json` (devDependency `supabase`)

**Interfaces:**
- Produces:
  - A linked hosted Supabase project, usable as `npx supabase db push` in Plan 3
  - A CI workflow with jobs `verify` (install → `pnpm verify`), `admin-e2e` (Playwright, Chromium, uploads report on failure) and `secrets` (`gitleaks/gitleaks-action`)

- [ ] **Step 1: Link the project:** `npx supabase init`, then `npx supabase login`, then `npx supabase link --project-ref <ref>`. Expected: "Finished supabase link." No Docker or local stack.
- [ ] **Step 2: Ask the owner** whether the repo should be public or private (judges must be able to see it), and whether it lives under a **personal account or an organization**. Then run `gh repo create <owner>/credit-coach --source . --<public|private> --push`.
- [ ] **Step 3: Write `ci.yml`.** It triggers on push and pull requests to `main`, uses Node LTS, `pnpm/action-setup`, and pnpm store caching.
  - The `secrets` job uses `gitleaks/gitleaks-action` **only for a personal-account repo**. For an **organization** repo the action needs a paid license secret. In that case run the gitleaks binary or the `zricethezav/gitleaks` Docker image directly. Check the action's README to confirm.
- [ ] **Step 4: Prove secret detection works locally.** Do **not** push a key-shaped string. GitHub push protection and partner secret scanning would reject it or report it.
  - Create a temp folder **outside the repo** containing a file with a fake key, `sk-ant-api03-` followed by 80 random characters.
  - Run `gitleaks dir <temp-folder>` (or `gitleaks detect --no-git -s <temp-folder>` on older versions). Expected: a finding and a non-zero exit.
  - Delete the temp folder.
- [ ] **Step 5: Confirm the main run is green.** Push to `main`. Expected: all three CI jobs pass (`gh run watch`).
- [ ] **Step 6: Commit** `ci: add verify, admin e2e and gitleaks jobs; link Supabase`.

---

### Task 6: AI dev setup, part 1: `CLAUDE.md`, rules and agents

**Files:**
- Create: `CLAUDE.md`
- Create: `.claude/rules/` adapted from ECC
  - from `rules/common/`: `testing.md`, `security.md`, `git-workflow.md`, `coding-style.md`, `code-review.md`
  - from `rules/typescript/`: `typescript.md` (merge of coding-style, patterns, security, testing)
  - from `rules/react-native/`: `react-native.md` (merge of patterns, security, testing, performance, production-readiness)
- Create: `.claude/agents/` copied from ECC `agents/`: `planner.md`, `code-reviewer.md`, `security-reviewer.md`, `typescript-reviewer.md`, `react-reviewer.md`, `tdd-guide.md`, `silent-failure-hunter.md`
- Create: `docs/adr/0001-tech-stack.md`, `docs/adr/0002-curated-ai-dev-setup.md`

**Interfaces:**
- Produces: the agent names above (used by `/feature` in Task 7), and `CLAUDE.md` sections "Source of truth", "Workflow", "Who owns what", "Repo map", "Commands", "Non-negotiables".

- [ ] **Step 1: Write `CLAUDE.md`** (≤ 120 lines). It must state:
  - `docs/PRD.md` is the source of truth; read the relevant section before any feature. Domain facts are in PRD §4 and the `credit-domain` skill.
  - The **ownership table**:
    - superpowers: brainstorming, writing-plans, TDD, executing-plans, verification-before-completion
    - ECC agents: planner (second opinion), code / typescript / react / security reviewers, silent-failure-hunter
    - custom: `credit-domain`, `maestro-android-e2e`, `process-journal`
  - **Non-negotiables:**
    - the engine is pure (no I/O, no Date.now(); dates are passed in)
    - the LLM never computes amounts, dates or scores
    - never show an exact predicted score
    - PAN is never stored or logged in full
    - no secrets in the repo
    - commits carry no AI attribution lines
- [ ] **Step 2: Copy and adapt the 7 agents.** Add the attribution line. Remove `MUST BE USED for all code changes` / `PROACTIVELY` phrasing that would make every agent auto-fire. Add one line of project context pointing to `CLAUDE.md` and the PRD.
- [ ] **Step 3: Copy and adapt the rules.** Delete guidance for stacks we don't use. Change ECC's "80% coverage" to: **engine ≥ 90% line coverage; apps covered by E2E flows rather than a percentage**. Add frontmatter `paths:` globs so the TypeScript rules apply to `**/*.ts(x)` and the React Native rules apply to `apps/mobile/**`.
- [ ] **Step 4: Check for leftover ECC references.** Run `rg -n "ecc:|CLAUDE_PLUGIN_ROOT|~/.claude/skills|everything-claude-code" .claude CLAUDE.md`. Expected: matches only in attribution lines.
- [ ] **Step 5: Confirm the agents and rules load.** Start a fresh `claude` session in the repo.
  - Run `/agents` and confirm all 7 project agents are listed.
  - Open `/memory` (or ask "which rules apply to packages/engine/src/utilization.ts?") and confirm the `.claude/rules/` files with `paths:` frontmatter are picked up.
  - If the installed CLI doesn't load `.claude/rules/`, fall back to `@.claude/rules/<file>.md` imports from `CLAUDE.md`.
- [ ] **Step 6: Write ADRs 0001 and 0002.** 0001 summarises tech-stack.md. 0002 explains the curated, project-owned ECC subset and why it isn't a fork or full plugin (bloat, overlap with superpowers, slow hooks, invisible to judges).
- [ ] **Step 7: Commit** `chore(ai): add CLAUDE.md, adapted ECC rules and agents, ADRs`.

---

### Task 7: AI dev setup, part 2: skills, hooks and commands

**Files:**
- Create (copied from ECC `skills/` and adapted):
  - `.claude/skills/tdd-workflow/`: remove the `CLAUDE_PLUGIN_ROOT` / `scripts/` references found in the source, and align it with superpowers TDD
  - `.claude/skills/verification-loop/`
  - `.claude/skills/intent-driven-development/`
  - `.claude/skills/architecture-decision-records/`
  - `.claude/skills/ai-regression-testing/`
  - `.claude/skills/react-native-patterns/`
  - `.claude/skills/e2e-testing/` (Playwright)
  - `.claude/skills/postgres-patterns/`
  - `.claude/skills/app-security-review/`: ECC `security-review` **renamed**, because it collides with the built-in `security-review`
- Create (custom):
  - `.claude/skills/credit-domain/SKILL.md`
  - `.claude/skills/maestro-android-e2e/SKILL.md`
  - `.claude/skills/process-journal/SKILL.md`
- Create:
  - `.claude/hooks/protect-env.mjs`, `.claude/hooks/format-on-edit.mjs`, `.claude/hooks/lib/paths.mjs`
  - `.claude/settings.json`
  - `.claude/commands/feature.md`, `.claude/commands/verify.md`, `.claude/commands/journal.md`
- Create: `.claude/hooks/package.json` (name `@credit-coach/hooks`, `"type": "module"`, scripts `test: vitest run`). Add `.claude/hooks` to the `pnpm-workspace.yaml` globs so `pnpm -r test`, and therefore `pnpm verify` and CI, runs it. `pnpm -r` skips the workspace root, so a root-level Vitest config would never run.
- Test: `.claude/hooks/lib/paths.test.mjs`
- Create: `docs/journal/README.md` (template)

**Interfaces:**
- Produces:
  - `isProtectedPath(filePath: string): boolean` in `.claude/hooks/lib/paths.mjs`
  - `isFormattable(filePath: string): boolean` (true for `.ts .tsx .js .mjs .json .md .yaml .yml .css`)
  - `/feature <PRD section>`, `/verify` and `/journal <title>` commands

- [ ] **Step 1: Write the failing tests:**

```js
import { describe, it, expect } from 'vitest';
import { isProtectedPath, isFormattable } from './paths.mjs';

describe('isProtectedPath', () => {
  it.each([
    '.env', 'apps/admin/.env.local', 'C:\\repo\\apps\\admin\\.env.local',
    'apps/mobile/.ENV', 'supabase/.env.production',
  ])('blocks %s', (p) => expect(isProtectedPath(p)).toBe(true));
  it.each([
    '.env.example', 'apps/mobile/.env.example', 'C:\\repo\\.env.example',
    'src/environment.ts', 'docs/env.md',
  ])('allows %s', (p) => expect(isProtectedPath(p)).toBe(false));
});

describe('isFormattable', () => {
  it('accepts code, json, md, yaml', () => {
    for (const p of ['a.ts', 'b.tsx', 'c.json', 'd.md', 'e.yaml', 'C:\\x\\f.mjs'])
      expect(isFormattable(p)).toBe(true);
  });
  it('rejects binaries and unknown types', () => {
    for (const p of ['a.png', 'b.apk', 'c', 'd.lock']) expect(isFormattable(p)).toBe(false);
  });
});
```

- [ ] **Step 2:** `pnpm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement both functions.** Normalise `\` to `/`, take the basename, and compare case-insensitively. Protected = basename `.env` or matches `^\.env\..+` except `.env.example`.
- [ ] **Step 4:** `pnpm test`. Expected: PASS, with **12 hook tests** (10 `isProtectedPath` cases + 2 `isFormattable` tests) reported under `@credit-coach/hooks`, alongside the 4 engine tests.
- [ ] **Step 5: Write the hook scripts.**
  - `protect-env.mjs` reads the hook JSON from stdin. If `tool_input.file_path` is protected, it prints a reason to stderr and exits 2 (block). Otherwise it exits 0.
  - `format-on-edit.mjs` runs `prettier --write <file>` via `npx --no-install` only when `isFormattable`. On **any** error, including prettier not being installed, it exits 0 silently. It must never block.
  - Register both in `.claude/settings.json`: `PreToolUse` with matcher `Write|Edit|MultiEdit` → `node .claude/hooks/protect-env.mjs`; `PostToolUse` with the same matcher → `node .claude/hooks/format-on-edit.mjs`.
- [ ] **Step 6: Manually check the hooks** in a fresh `claude` session:
  - Ask it to create `apps/admin/.env.local`. Expected: blocked with the reason.
  - Ask it to edit `apps/mobile/.env.example`. Expected: allowed.
  - Edit a `.ts` file with bad spacing. Expected: it gets formatted.
- [ ] **Step 7: Copy and adapt the 9 ECC skills.** Add the attribution line. Delete sections about stacks or tools we don't use. Run `rg -n "CLAUDE_PLUGIN_ROOT|ecc:" .claude/skills`. Expected: attribution lines only.
- [ ] **Step 8: Write the custom skills.**
  - `credit-domain`:
    - facts F1–F7 from PRD §4, verbatim
    - utilization formulas (Task 2)
    - planner priority order (PRD §5.3 steps 1–5) and reporting bases (§5.4)
    - predictor rules (§5.5): range not exact, clamp 300–900, monotonicity
    - the anti-goals list
  - `maestro-android-e2e`:
    - how to build a release APK
    - stop Metro
    - `testID` conventions (kebab-case, screen-prefixed, e.g. `dashboard-overall-util`)
    - flows live in `apps/mobile/.maestro/`
    - committing screenshots and recordings to `docs/test-reports/`
  - `process-journal`: when and how to write `docs/journal/NNN-<slug>.md`, with sections Goal, PRD refs, Plan link, What the AI did, Tests added, Review findings & fixes, What I learned, Time spent.
- [ ] **Step 9: Write the commands.**
  - `/feature <PRD §>`:
    1. read the PRD section and `credit-domain`
    2. superpowers:writing-plans if no plan exists
    3. superpowers TDD per task
    4. typescript-reviewer, plus react-reviewer for `.tsx`
    5. security-reviewer if auth, PII or network is touched
    6. `/verify`
    7. `/journal`
  - `/verify`: `pnpm verify`, then the admin `test:e2e` if `apps/admin` changed. It reminds the user to run Maestro if `apps/mobile` changed, and reports PASS/FAIL per stage in the `verification-loop` format.
  - `/journal`: follows the process-journal skill.
- [ ] **Step 10: Confirm the skills and commands load.** Start a fresh `claude` session in the repo. Expected: the skill list includes the 12 project skills; `/feature`, `/verify` and `/journal` autocomplete.
- [ ] **Step 11:** `pnpm verify`. Expected: PASS.
- [ ] **Step 12: Commit** `chore(ai): add curated skills, custom credit-domain/maestro/journal skills, safety hooks, workflow commands`.

---

### Task 8: First journal entry, README and a fresh-clone check

**Files:**
- Create: `docs/journal/000-brainstorm-and-foundation.md`
- Modify: `README.md`

- [ ] **Step 1: Write journal entry 000.** It covers:
  - the brainstorming session (original PRD → frozen PRD v1; key research findings F1–F7; decisions and calls)
  - the tech-stack choice
  - how ECC was mined (scan → curated subset → adaptations)
  - what this plan built, and the times taken
- [ ] **Step 2: Fill in the README.** Cover:
  - what it is
  - repo map
  - prerequisites (Task 0)
  - "Run locally" for engine, admin and mobile
  - how to build the APK
  - how to run each test layer
  - the "AI-assisted development" section linking `CLAUDE.md`, `.claude/`, `docs/adr/` and `docs/journal/`
  - credits to ECC
- [ ] **Step 3: Check a fresh clone.** In a temp directory, run `gh repo clone credit-coach`, then `pnpm install`, then `pnpm verify`. Expected: PASS with no manual fixes. Fix anything missing from the README.
- [ ] **Step 4: Commit and push** `docs: add foundation journal entry and README`. Expected: CI green.

**Done when:** all of the following hold:
- CI is green on `main`
- the release APK passes `smoke.yaml` with Metro stopped
- the EAS APK link works, or its failure is journaled
- the fresh `claude` session lists 7 agents, 12 skills and 3 commands
- the hooks behave as in Task 7 Step 6
