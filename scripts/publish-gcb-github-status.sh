#!/usr/bin/env bash
# Publish the canonical Google Cloud Build result to the exact GitHub commit.
# Authentication is delegated to the local `gh` credential store. Credentials
# must never be copied into GCB, the repository, Google Drive, or logs.
set -euo pipefail

REPO="Airtrust-Org/airtrust"
CONTEXT="airtrust-gcb"

usage() {
  echo "usage: $0 <pending|success|failed> <commit-sha> <gcb-build-url> [--dry-run]" >&2
  exit 64
}

state="${1:-}"
sha="${2:-}"
target_url="${3:-}"
dry_run="${4:-}"

[[ "$state" == "pending" || "$state" == "success" || "$state" == "failed" ]] || usage
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || usage
[[ "$target_url" == https://console.cloud.google.com/cloud-build/builds/* ]] || usage
[[ -z "$dry_run" || "$dry_run" == "--dry-run" ]] || usage

case "$state" in
  pending) github_state="pending" ;;
  success) github_state="success" ;;
  failed) github_state="failure" ;;
esac

description="Google Cloud Build validation ${state}"

if [[ "$dry_run" == "--dry-run" ]]; then
  printf 'DRY_RUN state=%s context=%s sha=%s target_url=%s repo=%s\n' \
    "$github_state" "$CONTEXT" "$sha" "$target_url" "$REPO"
  exit 0
fi

# Verify the SHA resolves in the canonical repository before publishing.
gh api "repos/${REPO}/commits/${sha}" --jq '.sha' | grep -qx "$sha"

gh api --method POST "repos/${REPO}/statuses/${sha}" \
  -f state="$github_state" \
  -f context="$CONTEXT" \
  -f description="$description" \
  -f target_url="$target_url" \
  >/dev/null

printf 'GITHUB_COMMIT_STATUS state=%s context=%s sha=%s\n' \
  "$github_state" "$CONTEXT" "$sha"
