#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "ERROR: deploy only from main (current: $branch)"
  exit 1
fi

if ! git diff --quiet; then
  echo "ERROR: unstaged tracked changes detected"
  exit 1
fi

if ! git diff --cached --quiet; then
  echo "ERROR: staged tracked changes detected"
  exit 1
fi

git fetch origin main >/dev/null 2>&1 || true

head_sha="$(git rev-parse HEAD)"
origin_sha="$(git rev-parse origin/main)"

echo "Branch: $branch"
echo "HEAD: $head_sha"
echo "origin/main: $origin_sha"

if [[ "$head_sha" != "$origin_sha" ]]; then
  echo "ERROR: HEAD != origin/main"
  exit 1
fi

echo "OK: clean deploy preflight passed"

if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "WARN: untracked files detected (not blocking):"
fi

git status --short --untracked-files=all

if [[ -n "${FRMS_GOVERNANCE_D1_NAME:-}" ]]; then
  echo ""
  echo "=== FRMS governance readiness gate ==="
  node scripts/frms-governance-preflight.mjs --remote
else
  echo ""
  echo "SKIPPED: FRMS governance readiness gate (FRMS_GOVERNANCE_D1_NAME not set)."
fi
