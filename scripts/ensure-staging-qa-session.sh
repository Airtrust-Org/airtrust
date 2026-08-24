#!/usr/bin/env bash
# Uses only the existing guarded staging smoke seed and shared auth smoke.
set -euo pipefail

readonly STAGING_API_DEFAULT="https://airtrust-api-staging.airtrust.workers.dev"
readonly STAGING_D1_ALLOWED="airtrust-db-staging-baseline-20260701"

usage() {
  printf 'Usage: %s [--check-only]\n' "${0##*/}" >&2
}

check_target() {
  local base_url="${STAGING_API_BASE_URL:-$STAGING_API_DEFAULT}"
  local db_name="${STAGING_D1_NAME:-$STAGING_D1_ALLOWED}"
  if [[ "$base_url" != https://*staging* ]] || [[ "$base_url" == *prod* ]] || [[ "$db_name" != "$STAGING_D1_ALLOWED" ]]; then
    printf 'STAGING_QA_UNSAFE_TARGET\n' >&2
    return 64
  fi
}

check_secrets() {
  [[ -n "${STAGING_SMOKE_EMAIL:-}" && -n "${STAGING_SMOKE_PASSWORD:-}" ]]
}

run_auth_check() {
  node scripts/check-staging-qa-session.mjs
}

main() {
  local mode="${1:---check-only}"
  if [[ "$mode" != "--check-only" && "$mode" != "--ensure" ]]; then
    usage
    return 64
  fi
  check_target

  if [[ "$mode" == "--check-only" ]]; then
    if ! check_secrets; then
      printf 'STAGING_QA_SESSION_UNAVAILABLE\n' >&2
      return 20
    fi
    run_auth_check
    printf 'STAGING_QA_SESSION_AVAILABLE\n'
    return 0
  fi

  # Reseed only through the production-blocked, staging-specific mechanism.
  # A generated password exists only in this process environment: neither the
  # seed nor the smoke logs cleartext credentials. The identity is the
  # sanctioned synthetic smoke identity, never an operational user.
  if [[ -z "${STAGING_SMOKE_EMAIL:-}" ]]; then
    export STAGING_SMOKE_EMAIL="smoke.staging.20260701@airtrust.invalid"
  fi
  if [[ -z "${STAGING_SMOKE_PASSWORD:-}" ]]; then
    export STAGING_SMOKE_PASSWORD
    STAGING_SMOKE_PASSWORD="$(openssl rand -base64 36)"
  fi
  node scripts/seed-staging-smoke-user.mjs --apply --confirm-staging-baseline
  run_auth_check
  printf 'STAGING_QA_SESSION_AVAILABLE\n'
}

main "$@"
