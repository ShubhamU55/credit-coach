#!/usr/bin/env bash
# bootstrap-board.sh - idempotent bootstrap of the Credit Coach GitHub Projects v2
# board, its milestones and its labels (Plan 1c, Task W5-2).
#
# Creates, only when missing (checked by exact name/title before every create):
#   - the user-owned Projects v2 board "Credit Coach" (ShubhamU55), linked to
#     ShubhamU55/credit-coach
#   - its Status single-select with exactly: Backlog, Ready, In progress, Review,
#     Done, Blocked (in that order)
#   - the custom fields Plan (text), Task # (text), Wave (number), Agent (text),
#     Attempts (number), Est. vs actual (text)
#   - the repo milestones (Foundation ... Submission)
#   - the repo labels: severity:*, area:*, agent:<every file in .claude/agents>,
#     found-by:<tester/reviewer/hunter/checker/analyst agents + owner>, blocked,
#     escalated, cannot-reproduce, triaged. `bug` and `hold` already exist and are
#     never touched. `session:*` labels are NOT created here: they are created per
#     worktree when a ticket is claimed.
#
# A second run creates nothing: every line prints "exists: ...".
#
# Usage:
#   GH_TOKEN=$(gh auth token --user ShubhamU55) bash scripts/pm/bootstrap-board.sh [--dry-run]
#
#   --dry-run   (default off) existence checks still run, read-only; every mutating
#               step prints "would create: ..." instead of acting.
#
# Required token scopes: `project` (Projects v2 read/write) and `repo` (labels,
# milestones, linking the project to the repo).
#
# Safety:
#   - Requires GH_TOKEN in the environment and refuses to run unless the token
#     authenticates as ShubhamU55. It never runs `gh auth switch`.
#   - Nothing read back from GitHub is interpolated into a command before it is
#     validated against a strict pattern (project number ^[0-9]+$, node and option
#     ids ^[A-Za-z0-9_-]+$, the project url; field names and types are only compared
#     as whole values).
#
# Status options mechanism (chosen after read-only introspection of GitHub's GraphQL
# schema): the `updateProjectV2Field` mutation. Its input type
# UpdateProjectV2FieldInput has `fieldId: ID!` and
# `singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]`, and each option
# input takes `name`, `color` (ProjectV2SingleSelectFieldOptionColor) and
# `description` (all required) plus an optional `id`. The call REPLACES the field's
# option list, so a new board's default Todo / In Progress / Done become the six
# wanted columns. Options that already exist by exact name are sent with their
# existing `id`, which keeps the board items already placed in that column. If the
# options already match exactly (names and order), nothing is changed.

set -euo pipefail

OWNER="ShubhamU55"
REPO="ShubhamU55/credit-coach"
BOARD_TITLE="Credit Coach"
RETRY_TRIES=5
RETRY_SLEEP="${BOOTSTRAP_RETRY_SLEEP:-2}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENTS_DIR="$ROOT/.claude/agents"

DRY_RUN=0
NL=$'\n'

STATUS_NAMES=("Backlog" "Ready" "In progress" "Review" "Done" "Blocked")
STATUS_COLORS=("GRAY" "BLUE" "YELLOW" "PURPLE" "GREEN" "RED")

# name:GraphQL data type
CUSTOM_FIELDS=("Plan:TEXT" "Task #:TEXT" "Wave:NUMBER" "Agent:TEXT" "Attempts:NUMBER" "Est. vs actual:TEXT")

MILESTONES=("Foundation" "Agentic system" "Engine" "Backend" "UI kit" "Screens" "Admin" "Submission")

PROJECT_STATE_QUERY='query ProjectState($login:String!,$number:Int!){user(login:$login){projectV2(number:$number){id url fields(first:100){nodes{__typename ... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{options{id name}}}}}}}'
# One tab-separated line per object: PROJECT<TAB>id<TAB>url, FIELD<TAB>id<TAB>name<TAB>dataType<TAB>opt~id|opt~id
PROJECT_STATE_JQ='.data.user.projectV2 | "PROJECT\t\(.id)\t\(.url)", (.fields.nodes[] | select(.name != null) | "FIELD\t\(.id)\t\(.name)\t\(.dataType)\t\([.options[]? | "\(.name)~\(.id)"] | join("|"))")'
REPO_PROJECTS_QUERY='query RepoProjects($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:100){nodes{number}}}}'

PROJECT_NUMBER=""
PROJECT_ID=""
PROJECT_URL=""
PROJECT_STATE=""
FIELD_ID=""
FIELD_TYPE=""
FIELD_OPTS=""
LABELS_SNAPSHOT=""
LABEL_SPECS=()

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# gh with CRLF stripped (Git Bash on Windows runs gh.exe).
gh_() { gh "$@" | tr -d '\r'; }

# Whole-line, fixed-string membership test in pure bash: no fork (this runs in
# loops, and process creation is slow under Git Bash on Windows) and no pipe that
# could turn grep -q closing early into a SIGPIPE failure under pipefail.
has_line() { [[ "${NL}${2}${NL}" == *"${NL}${1}${NL}"* ]]; }

retry() {
  local i
  for ((i = 1; i <= RETRY_TRIES; i++)); do
    if "$@"; then return 0; fi
    if ((i < RETRY_TRIES)); then sleep "$RETRY_SLEEP"; fi
  done
  return 1
}

usage() {
  sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------- arguments

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown argument: $arg (usage: bootstrap-board.sh [--dry-run])" ;;
  esac
done

# ---------------------------------------------------------------- guards

[[ -n "${GH_TOKEN:-}" ]] || die "GH_TOKEN is not set. Run: GH_TOKEN=\$(gh auth token --user $OWNER) bash scripts/pm/bootstrap-board.sh"
export GH_PROMPT_DISABLED=1
export GH_NO_UPDATE_NOTIFIER=1

login="$(gh_ api user --jq .login)" || die "gh api user failed (is GH_TOKEN valid?)"
[[ "$login" == "$OWNER" ]] || die "GH_TOKEN authenticates as '$login', expected '$OWNER'. Refusing to run."

if ((DRY_RUN)); then say "mode: dry-run (read-only; nothing will be created)"; fi

# ---------------------------------------------------------------- project

find_project_number() {
  local numbers count
  if ! numbers="$(gh_ project list --owner "$OWNER" --format json --limit 100 \
    --jq ".projects[] | select(.title == \"$BOARD_TITLE\") | .number")"; then
    die "gh project list failed (does the token have the 'project' scope?)"
  fi
  if [[ -z "$numbers" ]]; then return 0; fi
  count="$(wc -l <<<"$numbers" | tr -d ' ')"
  [[ "$count" == "1" ]] || die "found $count projects titled '$BOARD_TITLE' under $OWNER; resolve the duplicates by hand"
  [[ "$numbers" =~ ^[0-9]+$ ]] || die "unexpected project number from GitHub: '$numbers'"
  PROJECT_NUMBER="$numbers"
}

load_project_state() {
  local out first tag id url
  out="$(gh_ api graphql -f query="$PROJECT_STATE_QUERY" -f login="$OWNER" -F number="$PROJECT_NUMBER" \
    --jq "$PROJECT_STATE_JQ")" || return 1
  first="${out%%"$NL"*}"
  IFS=$'\t' read -r tag id url <<<"$first"
  [[ "$tag" == "PROJECT" ]] || return 1
  [[ "$id" =~ ^[A-Za-z0-9_-]+$ ]] || return 1
  [[ "$url" =~ ^https://github\.com/users/$OWNER/projects/[0-9]+$ ]] || return 1
  PROJECT_ID="$id"
  PROJECT_URL="$url"
  PROJECT_STATE="$out"
}

# Sets FIELD_ID / FIELD_TYPE / FIELD_OPTS for the field with this exact name.
lookup_field() {
  local wanted="$1" tag id name type opts
  FIELD_ID=""; FIELD_TYPE=""; FIELD_OPTS=""
  while IFS=$'\t' read -r tag id name type opts; do
    [[ "$tag" == "FIELD" && "$name" == "$wanted" ]] || continue
    [[ "$id" =~ ^[A-Za-z0-9_-]+$ ]] || die "unexpected field id for '$wanted': '$id'"
    FIELD_ID="$id"; FIELD_TYPE="$type"; FIELD_OPTS="$opts"
    return 0
  done <<<"$PROJECT_STATE"
  return 1
}

repo_links_project() {
  local numbers
  numbers="$(gh_ api graphql -f query="$REPO_PROJECTS_QUERY" -f owner="${REPO%%/*}" -f name="${REPO##*/}" \
    --jq '.data.repository.projectsV2.nodes[].number')" || return 1
  has_line "$PROJECT_NUMBER" "$numbers"
}

ensure_link() {
  if repo_links_project; then
    say "exists: link project #$PROJECT_NUMBER -> $REPO"
  elif ((DRY_RUN)); then
    say "would create: link project #$PROJECT_NUMBER -> $REPO"
  else
    gh_ project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null \
      || die "gh project link failed"
    retry repo_links_project || die "project #$PROJECT_NUMBER is not linked to $REPO after $RETRY_TRIES tries"
    say "created: link project #$PROJECT_NUMBER -> $REPO"
  fi
}

ensure_project() {
  find_project_number
  if [[ -n "$PROJECT_NUMBER" ]]; then
    say "exists: project \"$BOARD_TITLE\" (#$PROJECT_NUMBER)"
  elif ((DRY_RUN)); then
    say "would create: project \"$BOARD_TITLE\" (owner $OWNER)"
  else
    local created
    created="$(gh_ project create --owner "$OWNER" --title "$BOARD_TITLE" --format json --jq .number)" \
      || die "gh project create failed"
    [[ "$created" =~ ^[0-9]+$ ]] || die "unexpected project number from gh project create: '$created'"
    PROJECT_NUMBER="$created"
    say "created: project \"$BOARD_TITLE\" (#$PROJECT_NUMBER)"
  fi

  if [[ -n "$PROJECT_NUMBER" ]]; then
    retry load_project_state || die "project #$PROJECT_NUMBER not readable after $RETRY_TRIES tries"
    ensure_link
  else
    say "would create: link project \"$BOARD_TITLE\" -> $REPO"
  fi
}

# ---------------------------------------------------------------- Status field

# "name1|name2|..." from the "name~id|name~id" option list.
option_names_joined() {
  local IFS='|' part out="" parts
  read -ra parts <<<"$1"
  for part in "${parts[@]}"; do
    if [[ -n "$out" ]]; then out+="|"; fi
    out+="${part%~*}"
  done
  printf '%s' "$out"
}

# GraphQL list literal of the six options, reusing the id of any option that
# already exists by exact name so items keep their column.
build_status_options_graphql() {
  local IFS='|' parts i name id part out=""
  read -ra parts <<<"$FIELD_OPTS"
  for i in "${!STATUS_NAMES[@]}"; do
    name="${STATUS_NAMES[$i]}"
    id=""
    for part in "${parts[@]}"; do
      if [[ "${part%~*}" == "$name" ]]; then id="${part##*~}"; fi
    done
    if [[ -n "$id" ]]; then
      [[ "$id" =~ ^[A-Za-z0-9_-]+$ ]] || die "unexpected Status option id for '$name': '$id'"
      out+="{id: \"$id\", name: \"$name\", color: ${STATUS_COLORS[$i]}, description: \"\"}, "
    else
      out+="{name: \"$name\", color: ${STATUS_COLORS[$i]}, description: \"\"}, "
    fi
  done
  printf '%s' "$out"
}

status_matches() {
  local want="" name
  for name in "${STATUS_NAMES[@]}"; do
    if [[ -n "$want" ]]; then want+="|"; fi
    want+="$name"
  done
  lookup_field "Status" || return 1
  [[ "$FIELD_TYPE" == "SINGLE_SELECT" ]] || return 1
  [[ "$(option_names_joined "$FIELD_OPTS")" == "$want" ]]
}

reload_and_check_status() { load_project_state && status_matches; }

ensure_status_options() {
  local list="Backlog, Ready, In progress, Review, Done, Blocked"
  if [[ -z "$PROJECT_NUMBER" ]]; then
    say "would create: Status options ($list)"
    return 0
  fi
  lookup_field "Status" || die "project #$PROJECT_NUMBER has no Status field"
  [[ "$FIELD_TYPE" == "SINGLE_SELECT" ]] || die "Status field is $FIELD_TYPE, expected SINGLE_SELECT"
  if status_matches; then
    say "exists: Status options ($list)"
    return 0
  fi
  if ((DRY_RUN)); then
    say "would create: Status options ($list), replacing [$(option_names_joined "$FIELD_OPTS")]"
    return 0
  fi
  local options mutation
  options="$(build_status_options_graphql)"
  mutation="mutation UpdateStatusOptions(\$fieldId: ID!) { updateProjectV2Field(input: {fieldId: \$fieldId, singleSelectOptions: [${options}]}) { projectV2Field { ... on ProjectV2SingleSelectField { id } } } }"
  gh_ api graphql -f query="$mutation" -f fieldId="$FIELD_ID" >/dev/null \
    || die "updateProjectV2Field failed for Status"
  retry reload_and_check_status || die "Status options do not match after update ($RETRY_TRIES tries)"
  say "created: Status options ($list)"
}

# ---------------------------------------------------------------- custom fields

reload_and_find_field() { load_project_state && lookup_field "$1"; }

ensure_field() {
  local name="$1" type="$2"
  if [[ -z "$PROJECT_NUMBER" ]]; then
    say "would create: field \"$name\" ($type)"
    return 0
  fi
  if lookup_field "$name"; then
    [[ "$FIELD_TYPE" == "$type" ]] || die "field \"$name\" exists with type $FIELD_TYPE, expected $type; fix it by hand"
    say "exists: field \"$name\" ($type)"
    return 0
  fi
  if ((DRY_RUN)); then
    say "would create: field \"$name\" ($type)"
    return 0
  fi
  gh_ project field-create "$PROJECT_NUMBER" --owner "$OWNER" --name "$name" --data-type "$type" >/dev/null \
    || die "gh project field-create failed for \"$name\""
  retry reload_and_find_field "$name" || die "field \"$name\" not found after creating it ($RETRY_TRIES tries)"
  say "created: field \"$name\" ($type)"
}

# ---------------------------------------------------------------- milestones

fetch_milestones() {
  gh_ api "repos/$REPO/milestones?state=all&per_page=100" --paginate --jq '.[].title'
}

milestones_all_present() {
  local now title
  now="$(fetch_milestones)" || return 1
  for title in "${MILESTONES[@]}"; do
    has_line "$title" "$now" || return 1
  done
}

ensure_milestones() {
  local existing title
  existing="$(fetch_milestones)" || die "listing milestones failed"
  for title in "${MILESTONES[@]}"; do
    if has_line "$title" "$existing"; then
      say "exists: milestone \"$title\""
    elif ((DRY_RUN)); then
      say "would create: milestone \"$title\""
    else
      gh_ api --method POST "repos/$REPO/milestones" -f title="$title" >/dev/null \
        || die "creating milestone \"$title\" failed"
      say "created: milestone \"$title\""
    fi
  done
  if ((DRY_RUN)); then return 0; fi
  retry milestones_all_present || die "milestones missing after creating them ($RETRY_TRIES tries)"
}

# ---------------------------------------------------------------- labels

add_label_spec() { LABEL_SPECS+=("$1|$2|$3"); }

# Agents that can file bugs get a found-by: label.
is_bug_finder() {
  case "$1" in
    *-tester | *-reviewer | *-hunter | *-checker | *-analyst) return 0 ;;
    *) return 1 ;;
  esac
}

build_label_specs() {
  local file name found=0
  add_label_spec "severity:critical" "B60205" "Bug severity: data loss, security or a blocked demo path"
  add_label_spec "severity:high" "D93F0B" "Bug severity: significant defect, should fix before merge"
  add_label_spec "severity:medium" "FBCA04" "Bug severity: maintainability or minor defect"
  add_label_spec "severity:low" "0E8A16" "Bug severity: style or cosmetic"

  for name in engine mobile admin supabase agents docs ci; do
    add_label_spec "area:$name" "1D76DB" "Area of the repo: $name"
  done

  [[ -d "$AGENTS_DIR" ]] || die "agents directory not found: $AGENTS_DIR"
  for file in "$AGENTS_DIR"/*.md; do
    [[ -e "$file" ]] || continue
    name="${file##*/}"
    name="${name%.md}"
    if ! [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
      printf 'warning: skipping %s (not a valid agent name)\n' "$file" >&2
      continue
    fi
    found=1
    add_label_spec "agent:$name" "5319E7" "Agent: $name"
    if is_bug_finder "$name"; then
      add_label_spec "found-by:$name" "C5DEF5" "Bug found by agent: $name"
    fi
  done
  if ((found == 0)); then die "no agent files in $AGENTS_DIR"; fi
  add_label_spec "found-by:owner" "C5DEF5" "Bug found by the owner"

  add_label_spec "blocked" "D73A4A" "Blocked: waiting on something outside this ticket"
  add_label_spec "escalated" "D93F0B" "Escalated to the owner after retries failed"
  add_label_spec "cannot-reproduce" "CFD3D7" "Bug could not be reproduced"
  add_label_spec "triaged" "0E8A16" "Bug has been triaged"
}

fetch_labels() {
  gh_ label list --repo "$REPO" --limit 1000 --json name --jq '.[].name'
}

# GitHub label names are case-insensitive.
label_exists() { has_line "${1,,}" "${LABELS_SNAPSHOT,,}"; }

labels_all_present() {
  local spec
  LABELS_SNAPSHOT="$(fetch_labels)" || return 1
  for spec in "${LABEL_SPECS[@]}"; do
    label_exists "${spec%%|*}" || return 1
  done
}

ensure_labels() {
  local spec name color desc
  build_label_specs
  LABELS_SNAPSHOT="$(fetch_labels)" || die "listing labels failed"
  for spec in "${LABEL_SPECS[@]}"; do
    IFS='|' read -r name color desc <<<"$spec"
    [[ "$color" =~ ^[0-9A-Fa-f]{6}$ ]] || die "bad colour for label $name: $color"
    if label_exists "$name"; then
      say "exists: label $name"
    elif ((DRY_RUN)); then
      say "would create: label $name"
    else
      gh_ label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null \
        || die "creating label $name failed"
      say "created: label $name"
    fi
  done
  if ((DRY_RUN)); then return 0; fi
  retry labels_all_present || die "labels missing after creating them ($RETRY_TRIES tries)"
}

# ---------------------------------------------------------------- main

ensure_project
ensure_status_options

for entry in "${CUSTOM_FIELDS[@]}"; do
  ensure_field "${entry%%:*}" "${entry##*:}"
done

ensure_milestones
ensure_labels

if [[ -n "$PROJECT_URL" ]]; then
  say "project: $PROJECT_URL"
else
  say "project: (not created: dry run)"
fi
