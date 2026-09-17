#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "ERROR: not inside a Git repository" >&2
  exit 1
fi

cd "$ROOT"

echo "== AirTrust agent context =="
echo "repo:        $(git remote get-url origin 2>/dev/null || echo unknown)"
echo "branch:      $(git branch --show-current)"
echo "head:        $(git rev-parse HEAD)"
echo

echo "Fetching canonical main (read-only ref update)..."
if ! git fetch origin main --prune --quiet; then
  echo "WARN: unable to fetch origin/main; continuing with current local refs" >&2
fi

if git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo "origin/main: $(git rev-parse origin/main)"
  if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    echo "relation:    HEAD is at/behind origin/main"
  elif git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
    echo "relation:    HEAD is ahead of origin/main"
  else
    echo "relation:    HEAD and origin/main have diverged"
  fi
fi

echo
echo "== Working tree =="
git status --short --branch

echo
echo "== Recent canonical commits =="
git log --oneline --decorate -n 8 origin/main 2>/dev/null || git log --oneline --decorate -n 8

echo
echo "== Project commands =="
echo "repo doctor:      npm run repo:doctor"
echo "release status:   npm run release:status"
echo "focused tests:    run the smallest relevant test first"
echo "all unit tests:   npm run test:all"
echo "E2E:              npm run test:e2e"
echo "build:            npm run build"
echo
echo "Read AGENTS.md and the applicable runbook before remote/staging/production actions."
