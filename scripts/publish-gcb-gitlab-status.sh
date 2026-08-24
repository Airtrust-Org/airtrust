#!/usr/bin/env bash
# Historical GitLab status publisher, retained only for legacy records created
# before the 2026-08-24 GitHub cutover. New development must publish and review
# through GitHub; this script must not be used for new canonical branches.
# Authentication is delegated to the local glab keyring; this script neither
# reads nor writes credentials, and must never run inside Cloud Build.
set -euo pipefail

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

description="Google Cloud Build validation ${state}"
if [[ "$dry_run" == "--dry-run" ]]; then
  printf 'DRY_RUN state=%s name=airtrust-gcb sha=%s target_url=%s\n' "$state" "$sha" "$target_url"
  exit 0
fi

glab api --method POST "projects/airtrust-group%2Fairtrust/statuses/${sha}" \
  -f state="$state" \
  -f name=airtrust-gcb \
  -f description="$description" \
  -f target_url="$target_url" \
  >/dev/null
printf 'GITLAB_EXTERNAL_STATUS state=%s name=airtrust-gcb sha=%s\n' "$state" "$sha"
