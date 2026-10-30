#!/usr/bin/env bash
# open-pr.sh - push the current branch and open a pull request as ShubhamU55.
#
# Why this exists: the default `gh` account on the owner's machine is a work account with no rights on
# this repo, and parallel Claude sessions should never switch it. This script selects ShubhamU55
# explicitly for one push and one `gh pr create`, and never changes the default account.
#
# Usage (from inside a ticket worktree):
#   bash scripts/pm/open-pr.sh "<conventional-commit title>" "<path to a markdown body file>" [issue-number]
#
# It refuses to run on `main`, requires a clean tree, and pushes only the current branch. If an issue
# number is given, the PR body gets a `Closes #N` line appended. It does NOT merge and does NOT enable
# auto-merge; the owner merges (see docs/parallel-streams.md, "Merging without waiting").
set -euo pipefail

REPO="ShubhamU55/credit-coach"
OWNER_ACCOUNT="ShubhamU55"

die() { echo "open-pr: $*" >&2; exit 1; }

[[ $# -ge 2 ]] || die 'usage: open-pr.sh "<title>" "<body file>" [issue-number]'
title="$1"
body_file="$2"
issue="${3:-}"

[[ -f "$body_file" ]] || die "body file not found: $body_file"
[[ -z "$issue" || "$issue" =~ ^[1-9][0-9]*$ ]] || die "issue number must be a positive integer"
[[ "$title" =~ ^(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9-]+\))?:\ .{3,}$ ]] \
  || die "title must be a conventional commit subject, e.g. 'feat(engine): add the payment planner'"
(( ${#title} <= 72 )) || die "title is longer than 72 characters"

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" != "main" && "$branch" != "HEAD" ]] || die "refusing to run on '$branch'"
[[ "$branch" =~ ^[A-Za-z0-9._/-]+$ ]] || die "unexpected branch name: $branch"
[[ -z "$(git status --porcelain)" ]] || die "working tree is not clean; commit or stash first"

token="$(env -u GH_TOKEN gh auth token --user "$OWNER_ACCOUNT")" \
  || die "no stored gh token for $OWNER_ACCOUNT (run: gh auth login)"
login="$(GH_TOKEN="$token" gh api user --jq .login)"
[[ "$login" == "$OWNER_ACCOUNT" ]] || die "token belongs to '$login', expected $OWNER_ACCOUNT"

basic="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
git -c credential.helper= -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}" \
  push "https://github.com/${REPO}.git" "${branch}:refs/heads/${branch}"

existing="$(GH_TOKEN="$token" gh pr list --repo "$REPO" --head "$branch" --state open --json url --jq '.[0].url // empty')"
if [[ -n "$existing" ]]; then
  echo "open-pr: pushed; a pull request for this branch is already open: $existing"
  exit 0
fi

body="$(cat "$body_file")"
if [[ -n "$issue" ]]; then
  body="${body}"$'\n\n'"Closes #${issue}"
fi

# Every PR this script opens is agent-built, so it is labelled for counting AI work apart
# (docs/ai-policy.md, "Review"). --force makes the label call idempotent.
GH_TOKEN="$token" gh label create ai-assisted --repo "$REPO" --color 5319e7 \
  --description "Built with AI agents (see the PR's AI-assisted section)" --force >/dev/null
GH_TOKEN="$token" gh pr create --repo "$REPO" --base main --head "$branch" --title "$title" --body "$body" \
  --label ai-assisted
echo "open-pr: opened. CI runs now; merge when green (the owner merges as ${OWNER_ACCOUNT})."
