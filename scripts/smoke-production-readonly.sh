#!/usr/bin/env bash
set -euo pipefail

BASE_WEB="https://airtrust.online"
BASE_API="https://api.airtrust.online"

check_url() {
  local label="$1"
  local url="$2"
  local expected="$3"

  local body_file
  local headers_file
  body_file="$(mktemp)"
  headers_file="$(mktemp)"

  curl -sS -L -o "$body_file" -D "$headers_file" "$url" >/dev/null
  local status
  status=$(awk 'toupper($1) ~ /^HTTP\// {c=$2} END {print c}' "$headers_file")
  local size
  size=$(wc -c < "$body_file")

  printf '%s -> status=%s size=%sB\n' "$label" "$status" "$size"

  if [[ "$status" != "$expected" ]]; then
    printf 'FAIL: %s expected HTTP %s, got %s\n' "$label" "$expected" "$status" >&2
    rm -f "$body_file" "$headers_file"
    return 1
  fi

  if [[ "$label" == "API version" ]]; then
    local app_version
    app_version=$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$body_file" | head -n1)
    if [[ -z "$app_version" ]]; then
      printf 'FAIL: API version payload missing "version" field\n' >&2
      rm -f "$body_file" "$headers_file"
      return 1
    fi
    printf 'APP_VERSION=%s\n' "$app_version"
  fi

  rm -f "$body_file" "$headers_file"
}

printf '\n=== AIRTRUST PRODUCTION READ-ONLY SMOKE ===\n'
printf 'Timestamp: %s\n\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

check_url "Web root" "$BASE_WEB" "200"
check_url "Dashboard route" "$BASE_WEB/dashboard" "200"
check_url "API version" "$BASE_API/api/version" "200"

printf '\nRESULT: PASS (read-only reachability)\n'
printf 'Note: authenticated smoke remains manual (see docs/AIRTRUST_AUTHENTICATED_SMOKE_CHECKLIST_v0_4.md).\n'
