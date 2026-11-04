#!/usr/bin/env bash
# Validate generated catalog commits on an unprotected staging ref before main.
# Maintains hourly sync while allowing main to require GitHub Actions checks.
set -Eeuo pipefail

log() { printf '[CATALOG] %s\n' "$*"; }
fail() { printf '[CATALOG] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${GITHUB_REPOSITORY:-}" == "baska-pro/baska-hub" ]] || fail "Unexpected repository."
command -v gh >/dev/null || fail "GitHub CLI is required."
command -v jq >/dev/null || fail "jq is required."
[[ -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" ]] || fail "GitHub Actions run identity missing."
[[ -n "${GH_TOKEN:-}" ]] || fail "GitHub Actions token missing."

generated=(registry/packages.tsv registry/catalog.json registry/repo-sync.json manifest.json)
dry_run="${BASKA_SYNC_DRY_RUN:-false}"
if [[ "$dry_run" == "true" ]]; then
  log "Dry-run: appending a blank JSON-safe line to manifest in the temporary checkout."
  printf '\n' >> manifest.json
fi

if git diff --quiet -- "${generated[@]}"; then
  log "Catalog already current; no new commit."
  exit 0
fi

git config user.name "baska-hub-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -- "${generated[@]}"
git diff --cached --quiet && { log "Nothing staged."; exit 0; }
git commit -m "chore: auto-sync public BASKA catalog"

sha="$(git rev-parse HEAD)"
stage="catalog-verified/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
log "Staging commit ${sha} on ${stage}"
git push origin "HEAD:refs/heads/${stage}"

cleanup() {
  code=$?
  if [[ "$code" -eq 0 ]]; then
    git push origin --delete "$stage" >/dev/null 2>&1 || log "WARN: could not delete temporary staging branch ${stage}"
  else
    log "Validation failed; staging ref retained for investigation: ${stage}"
  fi
}
trap cleanup EXIT

log "Dispatching full repository validation on the exact staged commit."
gh workflow run validate.yml --ref "$stage"

result="pending"
for attempt in $(seq 1 30); do
  data="$(gh run list --workflow validate.yml --branch "$stage" --event workflow_dispatch --limit 10 --json headSha,status,conclusion,databaseId)"
  result="$(printf '%s' "$data" | jq -r --arg sha "$sha" '
    [ .[] | select(.headSha == $sha) ] | sort_by(.databaseId) | last |
    if . == null or .status != "completed" then "pending"
    else (.conclusion // "pending") end
  ')"
  case "$result" in
    success) log "Workflow validation completed successfully."; break ;;
    pending) log "Validation pending (attempt ${attempt}/30)."; sleep 10 ;;
    *) fail "Validation workflow concluded: ${result}" ;;
  esac
done
[[ "$result" == "success" ]] || fail "Timed out waiting for staged validation."

# Do not mistake a workflow-level success for missing required job contexts.
checks="$(gh api "repos/${GITHUB_REPOSITORY}/commits/${sha}/check-runs?per_page=100")"
for job in validate python310; do
  outcome="$(printf '%s' "$checks" | jq -r --arg name "$job" '
    [ .check_runs[] | select(.name == $name) ] | last | .conclusion // ""
  ')"
  [[ "$outcome" == "success" ]] || fail "Expected check ${job} is not successful: ${outcome}"
done
log "Exact SHA has successful validate and python310 check runs."

if [[ "$dry_run" == "true" ]]; then
  log "Dry-run passed. Main is unchanged."
  exit 0
fi

# Another maintainer push while validating must never be overwritten.
git fetch origin main
base="$(git rev-parse origin/main)"
parent="$(git rev-parse HEAD^)"
[[ "$base" == "$parent" ]] || fail "Main changed during validation; refusing non-fast-forward update."

log "Fast-forward publishing validated commit to main."
git push origin "HEAD:refs/heads/main"
log "Main updated to ${sha} after successful staged checks."

# GITHUB_TOKEN pushes do not trigger normal push workflows, so dispatch Pages.
if ! gh workflow run pages.yml --ref main; then
  log "WARN: main updated, but Pages dispatch failed; use Deploy BASKA Web Catalog manually."
fi
