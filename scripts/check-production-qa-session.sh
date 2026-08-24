#!/usr/bin/env bash
# Check-only: this deliberately never authenticates, seeds, or writes data.
set -euo pipefail

readonly PRODUCTION_API_DEFAULT="https://api.airtrust.online"

main() {
  local base_url="${PROD_API_BASE_URL:-$PRODUCTION_API_DEFAULT}"
  if [[ "$base_url" != "https://api.airtrust.online" ]]; then
    printf 'PRODUCTION_QA_UNSAFE_TARGET\n' >&2
    return 64
  fi

  # Reachability is read-only. It also prevents interpreting a broken target as
  # an identity gap.
  if ! curl --fail --silent --show-error --max-time 15 "$base_url/api/health" >/dev/null; then
    printf 'PRODUCTION_QA_CHECK_TECHNICAL_ERROR\n' >&2
    return 1
  fi

  # The only current production helper is smoke-production-auth.mjs. It
  # requires credentials and performs a login, therefore it is not a
  # check-only session mechanism. The staging seed rejects production.
  # Do not use either mechanism here or infer that credentials are a valid QA
  # identity/session.
  printf 'PRODUCTION_QA_SESSION_UNAVAILABLE\n' >&2
  return 20
}

main "$@"
