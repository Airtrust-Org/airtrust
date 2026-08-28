#!/usr/bin/env bash
# Uses only the centrally governed staging smoke identity. It must never invent
# an ephemeral password: the durable credential lives in GitHub Environment
# `staging` and is injected by sanctioned CI workflows.
set -euo pipefail

readonly STAGING_API_DEFAULT="https://airtrust-api-staging.airtrust.workers.dev"
readonly STAGING_D1_ALLOWED="airtrust-db-staging-baseline-20260701"
readonly STAGING_QA_CANONICAL_EMAIL="qa-agent@staging.airtrust.invalid"

usage() {
  printf 'Usage: %s [--check-only|--ensure]\n' "${0##*/}" >&2
}

check_target() {
  local base_url="${STAGING_API_BASE_URL:-$STAGING_API_DEFAULT}"
  local db_name="${STAGING_D1_NAME:-$STAGING_D1_ALLOWED}"
  if [[ "$base_url" != https://*staging* ]] || [[ "$base_url" == *prod* ]] || [[ "$db_name" != "$STAGING_D1_ALLOWED" ]]; then
    printf 'STAGING_QA_UNSAFE_TARGET\n' >&2
    return 64
  fi
}

check_central_credentials() {
  [[ "${STAGING_SMOKE_EMAIL:-}" == "$STAGING_QA_CANONICAL_EMAIL" ]] || return 1
  [[ -n "${STAGING_SMOKE_PASSWORD:-}" ]] || return 1
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

  if ! check_central_credentials; then
    printf 'STAGING_QA_CENTRAL_CREDENTIALS_REQUIRED\n' >&2
    printf 'Expected login: %s; password must come from GitHub Environment staging.\n' "$STAGING_QA_CANONICAL_EMAIL" >&2
    return 20
  fi

  if [[ "$mode" == "--check-only" ]]; then
    run_auth_check
    printf 'STAGING_QA_SESSION_AVAILABLE\n'
    return 0
  fi

  # Reseed only with the same centrally injected credential. Never generate a
  # password here: a process-local password would immediately become unknown
  # to the next worktree/agent and recreate the incident this script prevents.
  node scripts/seed-staging-smoke-user.mjs --apply --confirm-staging-baseline
  run_auth_check
  printf 'STAGING_QA_SESSION_AVAILABLE\n'
}

main "$@"
