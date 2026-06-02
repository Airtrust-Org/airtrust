#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="${1:-$ROOT_DIR/scripts/validation/data-quality-checks-readonly.sql}"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "[data-quality-sql] SQL file not found: $SQL_FILE" >&2
  exit 1
fi

forbidden_pattern='(^|[^A-Z_])(INSERT|UPDATE|DELETE|UPSERT|REPLACE|DROP|CREATE|ALTER|PRAGMA|ATTACH|DETACH|VACUUM|ANALYZE|REINDEX|TRUNCATE|MERGE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)([^A-Z_]|$)'

if LC_ALL=C grep -Eiq "$forbidden_pattern" "$SQL_FILE"; then
  echo "[data-quality-sql] Forbidden SQL keyword found. File must remain SELECT-only." >&2
  exit 1
fi

if LC_ALL=C grep -Eiq '(wrangler|d1[[:space:]]+execute|--remote)' "$SQL_FILE"; then
  echo "[data-quality-sql] Forbidden remote execution token found." >&2
  exit 1
fi

awk '
  BEGIN { stmt = ""; count = 0; invalid = 0 }
  /^[[:space:]]*--/ { next }
  /^[[:space:]]*$/ { next }
  {
    stmt = stmt " " $0
    if ($0 ~ /;/) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", stmt)
      count++
      if (stmt !~ /^[[:space:]]*SELECT[[:space:]]+/) {
        print "[data-quality-sql] Non-SELECT statement #" count ": " stmt > "/dev/stderr"
        invalid = 1
      }
      stmt = ""
    }
  }
  END {
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", stmt)
    if (stmt != "") {
      print "[data-quality-sql] Unterminated statement: " stmt > "/dev/stderr"
      invalid = 1
    }
    if (count == 0) {
      print "[data-quality-sql] No SQL statements found." > "/dev/stderr"
      invalid = 1
    }
    exit invalid
  }
' "$SQL_FILE"

echo "[data-quality-sql] PASS: SELECT-only SQL validated ($SQL_FILE)"
