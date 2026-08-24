#!/usr/bin/env bash
# Builds a Cloud Build source archive with the real, locally verified Git graph.
# It never contacts a remote service, never reads credentials, and strips remote
# configuration before the archive is emitted.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
expected_sha="${1:-$(git -C "$repo_root" rev-parse HEAD)}"
output_path="${2:-$repo_root/.tmp-gcb-source-${expected_sha}.tgz}"

head_sha="$(git -C "$repo_root" rev-parse HEAD)"
origin_main="$(git -C "$repo_root" rev-parse origin/main)"
merge_base="$(git -C "$repo_root" merge-base origin/main HEAD)"

test "$head_sha" = "$expected_sha"
test -z "$(git -C "$repo_root" status --porcelain)"

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/airtrust-gcb-source.XXXXXX")"
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

git clone --quiet --no-local --no-checkout "$repo_root" "$stage_dir"
git -C "$stage_dir" checkout --quiet --detach "$head_sha"
# The local clone's default fetch can omit an origin/main commit that advanced
# independently of the MR branch. Copy that already-verified local object into
# the staged graph; this never contacts GitLab.
git -C "$stage_dir" fetch --quiet "$repo_root" "$origin_main"
git -C "$stage_dir" update-ref refs/remotes/origin/main "$origin_main"
git -C "$stage_dir" config --remove-section remote.origin || true
git -C "$stage_dir" config --unset-all credential.helper || true
rm -rf "$stage_dir/.git/hooks"
rm -f "$stage_dir/.git/FETCH_HEAD" "$stage_dir/.git/ORIG_HEAD"

test "$(git -C "$stage_dir" rev-parse HEAD)" = "$head_sha"
test "$(git -C "$stage_dir" rev-parse origin/main)" = "$origin_main"
test "$(git -C "$stage_dir" merge-base origin/main HEAD)" = "$merge_base"
! git -C "$stage_dir" config --get-regexp '^(remote\..*|credential\.)' >/dev/null 2>&1

printf '%s\n' "$head_sha" > "$stage_dir/.ci-source-sha"
printf '%s\n' "$origin_main" > "$stage_dir/.ci-origin-main-sha"
printf '%s\n' "$merge_base" > "$stage_dir/.ci-merge-base-sha"

mkdir -p "$(dirname "$output_path")"
tar -C "$stage_dir" -czf "$output_path" .
printf 'GCB_SOURCE_ARCHIVE=%s\n' "$output_path"
