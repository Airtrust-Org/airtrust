#!/usr/bin/env bash
#
# ops-worktree-audit.sh — read-only audit of all git worktrees for AirTrust.
#
# Prints, per worktree:
#   path, branch, clean|dirty, merged|not-merged (into origin/main),
#   untracked count, last modification, and a recommendation:
#     keep | remove | archive-patch | review
#
# It NEVER removes a worktree on its own. Pass --prune-merged-clean to also
# print the exact (manual) commands you would run for SAFE removals only,
# and only with --execute will it actually run them. Even then it refuses to
# touch a dirty worktree or one with untracked files without an archived patch.
#
# Usage:
#   scripts/ops-worktree-audit.sh                 # audit only (default)
#   scripts/ops-worktree-audit.sh --base origin/develop
#   scripts/ops-worktree-audit.sh --prune-merged-clean            # dry-run plan
#   scripts/ops-worktree-audit.sh --prune-merged-clean --execute  # apply SAFE removals
#
set -euo pipefail

BASE_REF="origin/main"
PLAN_PRUNE=0
EXECUTE=0
ARCHIVE_DIR="docs/worktree-archive/$(date +%Y%m%d)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_REF="${2:?--base requires a ref}"; shift 2 ;;
    --prune-merged-clean) PLAN_PRUNE=1; shift ;;
    --execute) EXECUTE=1; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

# Resolve repo root from wherever the script is invoked.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "Not inside a git repository." >&2
  exit 2
fi
cd "$REPO_ROOT"

git fetch origin --quiet 2>/dev/null || echo "WARN: could not fetch origin (offline?); merged status may be stale" >&2

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "WARN: base ref '$BASE_REF' not found; merged status will be reported as unknown" >&2
  BASE_REF=""
fi

printf '%s\n' "=== AirTrust worktree audit ($(date -u +%Y-%m-%dT%H:%M:%SZ)) base=${BASE_REF:-<none>} ==="
printf '%s\n' ""

REMOVE_CANDIDATES=()

# Parse `git worktree list --porcelain` into records.
current_path=""
current_branch=""
while IFS= read -r line; do
  case "$line" in
    worktree\ *) current_path="${line#worktree }" ;;
    branch\ *)   current_branch="${line#branch }"; current_branch="${current_branch#refs/heads/}" ;;
    detached)    current_branch="(detached)" ;;
    "")
      [[ -z "$current_path" ]] && continue

      # dirty / untracked
      status_out="$(git -C "$current_path" status --porcelain 2>/dev/null || true)"
      untracked_count="$(printf '%s\n' "$status_out" | grep -c '^??' || true)"
      tracked_changes="$(printf '%s\n' "$status_out" | grep -c '^[^?]' || true)"
      if [[ -n "$status_out" ]]; then dirty="dirty"; else dirty="clean"; fi

      # merged into base?
      merged="unknown"
      if [[ -n "$BASE_REF" && "$current_branch" != "(detached)" ]]; then
        head_sha="$(git -C "$current_path" rev-parse HEAD 2>/dev/null || true)"
        if [[ -n "$head_sha" ]] && git merge-base --is-ancestor "$head_sha" "$BASE_REF" 2>/dev/null; then
          merged="merged"
        else
          merged="not-merged"
        fi
      fi

      # last activity = date of HEAD commit (portable across GNU/BSD)
      last_mod="$(git -C "$current_path" log -1 --format='%ci' 2>/dev/null || true)"
      [[ -z "$last_mod" ]] && last_mod="unknown"

      # recommendation
      is_main_repo="no"; [[ "$current_path" == "$REPO_ROOT" ]] && is_main_repo="yes"
      if [[ "$is_main_repo" == "yes" ]]; then
        rec="keep (main repo)"
      elif [[ "$dirty" == "dirty" && "$tracked_changes" -gt 0 ]]; then
        rec="archive-patch (local tracked changes)"
      elif [[ "$untracked_count" -gt 0 ]]; then
        rec="review (untracked files present)"
      elif [[ "$merged" == "merged" ]]; then
        rec="remove (clean + merged)"
        REMOVE_CANDIDATES+=("$current_path")
      elif [[ "$merged" == "not-merged" ]]; then
        rec="review (clean but not merged)"
      else
        rec="review"
      fi

      printf 'path:        %s\n' "$current_path"
      printf 'branch:      %s\n' "$current_branch"
      printf 'state:       %s\n' "$dirty"
      printf 'merged:      %s (base %s)\n' "$merged" "${BASE_REF:-<none>}"
      printf 'untracked:   %s\n' "$untracked_count"
      printf 'tracked-Δ:   %s\n' "$tracked_changes"
      printf 'last-mod:    %s\n' "$last_mod"
      printf 'RECOMMEND:   %s\n' "$rec"
      printf '%s\n' "---"

      current_path=""; current_branch=""
      ;;
  esac
done < <(git worktree list --porcelain; printf '\n')

if [[ "$PLAN_PRUNE" -eq 1 ]]; then
  printf '%s\n' ""
  printf '%s\n' "=== SAFE removal plan (clean + merged only) ==="
  if [[ "${#REMOVE_CANDIDATES[@]}" -eq 0 ]]; then
    printf '%s\n' "No safe removal candidates."
  else
    for wt in "${REMOVE_CANDIDATES[@]}"; do
      printf 'git worktree remove %q\n' "$wt"
    done
    if [[ "$EXECUTE" -eq 1 ]]; then
      printf '%s\n' "" "Executing SAFE removals..."
      for wt in "${REMOVE_CANDIDATES[@]}"; do
        # Re-check at execution time; refuse anything not clean.
        if [[ -n "$(git -C "$wt" status --porcelain 2>/dev/null || echo dirty)" ]]; then
          printf 'SKIP (now dirty): %s\n' "$wt"
          continue
        fi
        git worktree remove "$wt" && printf 'REMOVED: %s\n' "$wt"
      done
      git worktree prune
      printf '%s\n' "Pruned stale worktree registrations."
    else
      printf '%s\n' "" "(dry-run; re-run with --execute to apply the SAFE removals above)"
    fi
  fi
fi

printf '%s\n' "" "Archive directory for patches when removing dirty worktrees: $ARCHIVE_DIR"
printf '%s\n' "Save a patch with: git -C <worktree> diff > $ARCHIVE_DIR/<name>.patch"
