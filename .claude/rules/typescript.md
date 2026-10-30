---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.mjs'
---

<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# TypeScript rules

Project rules for TypeScript and JavaScript in this repo. `tsconfig.base.json` (`strict`,
`noUncheckedIndexedAccess`) and `eslint.shared.cjs` already enforce engine purity, the argless
`Date` ban, the raw-hex ban and the size limits; this file covers what they can't check.
`docs/standards.md` holds layout, testIDs and the golden examples.

## Types

- Exported functions declare parameter and return types; locals are inferred.
- No `any`. Untrusted input enters as `unknown` and is narrowed by a validator before use.
- String-literal unions, not `enum` (e.g. `ExplanationSource = 'ai' | 'template'`).
- Shared domain types live in `packages/engine/src/types.ts`. Apps import them from
  `@credit-coach/engine`; they never redeclare a card, payment or plan shape.
- With `noUncheckedIndexedAccess`, handle the `undefined` from an index; don't silence it with `!`.

## Engine (`packages/engine`)

- Pure: same inputs, same outputs. "Today", rules and config are parameters (CLAUDE.md rule 1).
- An expected domain outcome is a typed return value (`number | null`, a result union), never a
  throw. Throw only for a broken contract the caller must fix (e.g. `maskPan` on a malformed PAN).
- Money is integer rupees; dates are `YYYY-MM-DD` strings. Paise are rounded half-up at the
  boundary, not in the engine.
- Score output is always a range clamped to 300–900 (`formatScoreRange`), never one number.

## Boundaries

- The repo has no schema library. Each boundary has a hand-written validator that takes
  `unknown` and returns a typed result: `validatePayload` in `supabase/functions/explain/payload.ts`
  is the reference. Don't add Zod or another validation dependency without an owner decision.
- An LLM reply is untrusted text. It is checked for grounding (`isAcceptableAiText`) and capped
  before display, and the template fallback is always there (CLAUDE.md rule 2).
- PAN is masked with `maskPan` before it reaches any UI, log or error message.

## Errors and logging

- Never swallow an error. A fallback (template text, system fonts) is allowed only when it is
  visible to the user or logged with `console.warn` and a reason, as `explain/client.ts` does.
- No `console.log`. `console.warn` is for fallbacks and refused inputs only, and never logs a
  token, a key, a full PAN or a raw payload.

## Secrets

- Only `EXPO_PUBLIC_*` values and the Supabase anon key reach the app. The Anthropic key exists
  only in Edge Function secrets (CLAUDE.md rule 6).
- A required secret that is missing turns the feature off (template only); it never crashes.

## Tests

- Vitest for the engine and the hooks, Jest (`jest-expo`) for mobile. Engine coverage ≥ 90% lines.
- Property tests (`*.property.test.ts`, fast-check) for engine invariants; edge cases in
  `*.edge.test.ts`; fixed scenario outputs in `*.golden.test.ts`.
- Use **Playwright** for `apps/admin` E2E (see the `e2e-testing` skill). The mobile app uses Maestro instead; see `CLAUDE.md` and the `maestro-android-e2e` skill.
