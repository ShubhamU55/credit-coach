---
purpose: Run ledger for the AI-workflow audit fixes (PR #63), and the record of its mistitled squash commit
run: 2026-10-29, main session as controller; superpowers writing-plans + subagent-driven-development (no Workflow script for the build; /pr-review ran as the pr-review Workflow)
---

# AI-workflow audit fixes (PR #63, merged as `b4c9053`)

## History correction

`b4c9053` on `main` is the squash merge of **PR #63, `chore: close the AI-workflow audit gaps`**. This was a human error at merge time: the owner, merging by hand in the GitHub UI, pasted a line from a chat message into the title box instead of keeping the PR title. No agent wrote or merged it. The commit title reads "All 12 required checks have passed, and GitHub shows it CLEAN." It is not a conventional commit and carries no `(#63)`. The tree is identical to the reviewed PR head `899b5ee` (`git diff 899b5ee b4c9053` is empty). Force pushes to `main` are blocked and nobody may bypass the rule, so the title stays; `docs/ai-policy.md` (Review) lists it as the one known exception. To keep it from recurring, the squash-merge default message should be the pull request title.

## Why

An audit of `origin/main` (ecf9df3), using the ai-workflow-audit rubric, scored 4.11/5 ("Managed"). It found the repo's claims about its AI process did not match what GitHub and the files showed. Examples: no `pr-review` status on any sampled PR; the PR template's AI-assisted section was unused; the policy said "merge commit" while `main` requires linear history; nested `AGENTS.md` files were never loaded.

## How it was built

- **Plan:** `docs/superpowers/plans/2026-10-29-ai-audit-fixes.md` (Tasks 1-4, plus owner tasks O1-O4), approved by the owner.
- **Build:** one `implementer` subagent (Sonnet) per task, test-first, then a fresh reviewer subagent per task. The controller added Task 5 (scoped 60 s timeouts on spawn-based hook tests) by ruling.
- **Final review:** an Opus whole-branch review returned "ready after 5 fixes", with 0 critical findings. The fixes covered:
  - the branch-protection date: 27 Oct 2026, not 28;
  - the live-run count and the PD-ticket wording in `ai-system.md`;
  - `/bugfix` PR bodies failing the new check;
  - the parallel-streams FINISH prompt.

  One fix subagent applied all five, and a scoped re-review found all addressed.

- **Owner edits:** the owner made the hook-protected edits:
  - `.env` shell-read deny rules (O1);
  - `eslint.shared.cjs` added to `config-protection.cjs` (O2);
  - the `ci.yml` Markdown exclusion for `maestro-evidence`;
  - branch protection (O3): PR required, branches up to date, `pr-body` and `pr-review` required.
- **G8 review:** `/pr-review 63` returned approve, with 0 blocking findings and 13 advisory. It posted review 5701157617 and the `pr-review` status on 899b5ee.

## Rulings (controller)

- Ruling: no spec file exists, so the in-session audit findings served as the spec. Cost if wrong: doc wording the owner rewrites.
- Ruling: accept commit subjects shorter than the plan's, because the commit hook caps subjects at 72 characters. Cost if wrong: none.
- Ruling: overlap the next implementer with the previous task's review, which reads a saved diff. Cost if wrong: an out-of-order fix commit.
- Ruling: add Task 5. Spawn-based hook tests timed out at 5 s on a loaded machine, so they get 60 s per describe block, with no global change and no assertion change. Cost if wrong: a real hang takes 60 s to show.
- Ruling: the controller's Task 2 brief gave the wrong protection date. GitHub PR timestamps show protection went on 27 Oct 2026, and the final fix wave corrected it. Cost if wrong: none.
- Ruling: exempt Markdown-only `apps/mobile` changes from `maestro-evidence` (`apps/mobile/**/!(*.md)`), pinned by a test, rather than running the emulator for a pointer file. Cost if wrong: a docs-only mobile PR merges without a Maestro run.

## Follow-ups (from /pr-review advisories, not yet filed)

- `.claude/settings.json`: the `.env` shell deny rules have no test in `settings.test.mjs`.
- `pr-body`: it accepts `pnpm verify: failed` or `n/a`, so it checks for presence, not proof.
- The pr-review workflow starts the UI lens for `.md` files under `apps/mobile`.
