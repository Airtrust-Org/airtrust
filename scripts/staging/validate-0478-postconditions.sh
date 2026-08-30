#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "$ROOT/scripts/staging/validate-edb-0477-0480-postconditions.sh" "$@" --migration="0478_edb_anac_receipt_integrity.sql"
