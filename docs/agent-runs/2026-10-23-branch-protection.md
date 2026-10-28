---
purpose: Record of W5-1 (first push, CI fixes, repo settings, branch protection and their proof), with the commands run and what they returned
run: 2026-10-27, one controller session, owner confirmed each outward-facing step in chat
---

# W5-1: push, CI and branch protection — run ledger

The file name keeps the plan's `2026-10-23` date; the work happened on 2026-10-27. Every `gh` call ran as `ShubhamU55` (`GH_TOKEN=$(gh auth token --user ShubhamU55)`). The default `gh` account stayed `ShubhamUpadhyay-Nibe` (a work account) and was never used for this repo.

## Owner actions that had to happen first

- `gh auth refresh -h github.com -u ShubhamU55 -s workflow,project` failed on the owner's `gh` version (`unknown shorthand flag: 'u'`). The working sequence was `gh auth switch -u ShubhamU55`, `gh auth refresh -h github.com --scopes workflow,project` (browser step signed in as `ShubhamU55`), then switching back. Verified through the API header: `X-Oauth-Scopes: gist, project, read:org, repo, workflow`.
- Owner created the Sonar organization and project, set the `SONAR_TOKEN` secret and the `SONAR_REQUIRED=true` variable (verified with `gh secret list` and `gh variable list`), and turned off Sonar Automatic Analysis.

## Step 1: CI hardening (local, before the push)

Commit `d7968e8`: five third-party actions pinned to full commit SHAs with version comments (`dorny/paths-filter` v4.0.3, `pnpm/action-setup` v4.3.0, `gitleaks/gitleaks-action` v2.3.9, `SonarSource/sonarqube-scan-action` v8.4.0, `google/osv-scanner-action` v2.7.0), `deps` installs with `--ignore-scripts`, and `sonar` fails when `SONAR_REQUIRED` is `'true'` and the token is missing. Three of the five SHAs and one tag ref were re-checked read-only with `gh api` by the controller.

## Step 2: the push, and the first CI run

The remote repo was public and empty (`gh api repos/ShubhamU55/credit-coach` returned `"Git Repository is empty"` for commits). Before pushing, the controller scanned all 124 commits of `main` with grep patterns for common key formats (Anthropic, AWS, GitHub tokens, private keys, JWTs, Sonar token assignments). Zero real hits; the five `service_role` matches were prose in agent instructions. `gitleaks` was not installed locally, so this was a pattern scan only.

Push (token passed through an `http.extraheader`, never in the URL or the default credential helper):

```
git push https://github.com/ShubhamU55/credit-coach.git main:refs/heads/main
 * [new branch]      main -> main
```

First CI run on `d7968e8` (run 40544507191): `changes`, `secrets`, `admin-e2e`, CodeQL passed; `maestro-evidence` skipped; `sonar` passed but only skipped its scan (the secret did not exist yet); **`deps` and `verify` failed**:

1. `deps`: `pnpm audit --audit-level=high`, zod < 4.6.6 (GHSA-mrhx-c7xc-m3w5), transitive through `apps/mobile > expo > @expo/cli`.
2. `verify`: three tests in `ecc-hooks.test.mjs` (case variants of `.claude/settings.json`) expected the `config-protection` hook to exit 2 and got 0 on the Linux runner. They had always passed on the owner's case-insensitive Windows filesystem.

After the owner added the Sonar secret and variable, the `sonar` job was re-run alone and did a real scan (`SonarQube Cloud Scan: success`; both the "required but no token" step and the "skipped" step were skipped).

## The two fixes (each on a branch, via a PR)

- PR #1, `fix(deps): override zod to a patched version`: `overrides: 'zod@<4.6.6': '^4.6.6'` in `pnpm-workspace.yaml` plus the lockfile. The vulnerable copy was zod 3.25.76 pinned by `@expo/cli`, and zod 3 has no patched release, so this is a major-version change for a dev-time CLI. `expo --version` still runs. Not exercised at runtime: the Expo MCP devtools path. Merged as `a50fdf4` (by the owner, as `ShubhamU55`, because the harness declined an unreviewed agent merge).
- PR #2, `fix(hooks): block case variants of protected paths on case-sensitive FS`: the "first-time creation is allowed" check in `config-protection.cjs` looked only at the variant path, which does not exist on Linux. It now blocks a variant when the canonical protected file exists. This only widens what is blocked. Reproduced in a `node:22` Linux container and on a real case-sensitive Windows directory; the new tests fake a case-sensitive filesystem so they fail on any OS without the fix. Merged as `2df6656`. Known gap left as is: a differently cased linter config name (`.ESLINTRC.JS`) is still allowed on Linux when that exact spelling does not exist.

Result on `2df6656`: CI and CodeQL green; check runs: `verify`, `deps`, `secrets`, `sonar`, `changes`, `codeql`, SonarCloud Code Analysis passed, `admin-e2e` and `maestro-evidence` skipped (path-gated).

## Step 3: repository settings

```
gh api -X PATCH repos/ShubhamU55/credit-coach -F allow_auto_merge=true -F allow_squash_merge=true \
  -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true
before: {"allow_auto_merge":false,"allow_merge_commit":true,"allow_rebase_merge":true,"allow_squash_merge":true,"delete_branch_on_merge":false}
after:  {"allow_auto_merge":true,"allow_merge_commit":false,"allow_rebase_merge":false,"allow_squash_merge":true,"delete_branch_on_merge":true}
```

## Steps 4 and 5: check names and branch protection

`SonarCloud Code Analysis` (app `sonarqubecloud`) is the quality-gate decoration of the CI scan (title "Quality Gate passed"); it is not a duplicate of the `sonar` job. The job already carries `sonar.qualitygate.wait=true`, so a failed gate fails the required `sonar` check, and the decoration is not required separately. The CodeQL check-runs threshold was confirmed by the owner in the repo settings: security alerts "High or higher", standard alerts "Only errors" (these are also GitHub's defaults).

Protection request (`gh api -X PUT repos/ShubhamU55/credit-coach/branches/main/protection --input protection.json`; the branch was unprotected before, `404 Branch not protected`):

```json
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "verify",
      "admin-e2e",
      "secrets",
      "deps",
      "codeql",
      "CodeQL",
      "sonar",
      "maestro-evidence",
      "changes",
      "hold-check"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Response: `strict:false, enforce_admins:true, linear:true, force_push:false, deletions:false, pr_reviews:null`, with those ten contexts.

**Ruling (owner-confirmed): `pr-review` is not a required check.** The workflow had only ever run on a fake runtime, and requiring it with `enforce_admins=true` would make one failing agent lock out every merge. The only override is toggling `enforce_admins` off temporarily and recording it here. G3 (`api`) arrives with Plan 3.

## Step 6: proof that the protection works

1. A scratch empty commit pushed straight to `main` was rejected: `remote: error: GH006: Protected branch update failed for refs/heads/main. - 10 of 10 required status checks are expected.` Remote `main` stayed at `2df6656`.
2. Throwaway PR #3 adding `scratch/probe.md` (with a §8.6 header), labelled `hold` (the label was created for this): `hold-check` failed, every other check passed, and `mergeStateStatus` was `BLOCKED`. The PR was then closed without merging and its branch deleted, so the probe file never reached `main`. The "remove the label, auto-merge" half of the plan's step 6 was deliberately not run (see below).
3. First live `/pr-review 3` (Workflow run `wf_95c4f317-b4f`): 7 agents, 0 errors, about 88 s and 170k subagent tokens. Six lenses (`ui` was correctly left out: no `apps/mobile` change) returned 0 findings; verdict `approve`; `pr-reviewer` posted one COMMENT review (id 5672152211) and the commit status `pr-review = success` on `908101c`. This proves the plumbing end to end, not review quality: the diff was one scratch file.

### Findings from the live run

- **The harness flagged the `pr-reviewer` run as self-approval.** The PR author, the review author and the status creator were all `ShubhamU55`. The plan and spec §8.9 do specify this (GitHub refuses an author's own approval, hence COMMENT plus a status), but it means G8 is self-attested: the same token could post any commit status. Decision: do not require `pr-review` and do not let it trigger a merge; record it as advisory (see ADR 0003, Known deviations). Independent G8 needs a separate identity for `pr-reviewer`; not done.
- **The `/pr-review` command used the local `main` ref as the diff base.** In a ticket worktree local `main` was stale (`d7968e8`), so the diff pulled in the already-merged PR #1 and #2 changes. The controller used `origin/main` for the run. `.claude/commands/pr-review.md` step 4 now fetches and uses `origin/main`.
- The harness blocked an agent-run `gh pr merge` once ("Merge Without Review"); the owner performed the merges of PR #1 and #2 as `ShubhamU55`. Auto-merge was therefore never exercised.

## Still open after W5-1

- Auto-merge (`gh pr merge --auto --squash`) on a green PR has not been exercised.
- `pr-review` is not required; revisit only with an independent reviewer identity.
- Step 7 (this ledger) lands through a PR that the owner merges.
- W5-2 (the Projects board) is not started; the token now has the `project` scope.
