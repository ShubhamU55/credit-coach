---
description: Build one PRD feature end to end (read spec → plan → TDD → specialist review → verify → journal)
argument-hint: <PRD section, e.g. §5.3>
---

Build the feature described in **PRD $ARGUMENTS** using this project's workflow. Do the steps in order and don't skip any.

1. **Read** the PRD section `$ARGUMENTS` in `docs/PRD.md`, plus anything it references. Load the `credit-domain` skill. If the work touches UI, also read the relevant files in `.design/`.
2. **Plan.** If no plan in `docs/superpowers/plans/` covers this section, use superpowers `writing-plans` to write one, and ask the owner to approve it before building. If one exists, continue from its ledger.
3. **Build test-first** with superpowers `test-driven-development`. Engine logic goes in `packages/engine` (pure, `today` passed in). Mobile flows get a Maestro flow (`maestro-android-e2e` skill). Admin pages get a Playwright spec (`e2e-testing` skill).
4. **Review** the diff with these agents and fix what's Critical or Important:
   - `typescript-reviewer`, always
   - `react-reviewer`, if any `.tsx` changed
   - `security-reviewer`, if auth, PII/PAN, network, Supabase policies or secrets are touched
   - `silent-failure-hunter`, if error handling or fallbacks changed
5. **Verify** with `/verify`. Every stage must PASS before you claim done.
6. **Record** with `/journal <feature title>`.

Commit messages are conventional commits with no AI attribution lines.
