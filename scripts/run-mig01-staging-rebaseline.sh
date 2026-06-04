#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "MIG01_STAGING_REBASELINE=BLOCKED" >&2
  echo "REASON=$1" >&2
  exit 2
}

target="${AIRTRUST_CONTROLLED_TARGET:-${AIRTRUST_MIG01_TARGET:-}}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-${AIRTRUST_MIG01_APPROVED_BY:-}}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-${AIRTRUST_MIG01_SNAPSHOT_PATH:-}}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-${AIRTRUST_MIG01_ROLLBACK_PLAN_PATH:-}}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-${AIRTRUST_MIG01_SAFE_COMMAND_REVIEWED:-}}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-${AIRTRUST_MIG01_TARGET_REF:-}}"

baseline_output="${AIRTRUST_MIG01_BASELINE_OUTPUT_PATH:-$ROOT_DIR/docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql}"
summary_output="${AIRTRUST_MIG01_SUMMARY_OUTPUT_PATH:-$ROOT_DIR/docs/controlled-execution/mig01-staging-rebaseline-summary-20260604.txt}"

[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing_or_unreadable"
[[ -n "$rollback_path" && -r "$rollback_path" ]] || fail "rollback_missing_or_unreadable"
[[ "$safe_command_reviewed" == "YES" ]] || fail "safe_command_not_reviewed"

evidence="$snapshot_path $rollback_path $baseline_output $summary_output $target_ref"
if printf '%s' "$evidence" | LC_ALL=C grep -Eiq '(^|[^a-z])(prod|production|live)([^a-z]|$)'; then
  fail "target_evidence_looks_like_production"
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  fail "sqlite3_missing"
fi

integrity="$(sqlite3 "$snapshot_path" "PRAGMA integrity_check;")"
[[ "$integrity" == "ok" ]] || fail "snapshot_integrity_failed"

blocked_0389_objects="$(
  sqlite3 "$snapshot_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('user_platform_roles','support_access_sessions');"
)"
[[ "$blocked_0389_objects" == "0" ]] || fail "snapshot_contains_0389_objects"

mkdir -p "$(dirname "$baseline_output")" "$(dirname "$summary_output")"

tmp_baseline="$(mktemp)"
cleanup() {
  rm -f "$tmp_baseline"
}
trap cleanup EXIT

{
  echo "-- AirTrust MIG-01 staging schema baseline"
  echo "-- Generated: 2026-06-04"
  echo "-- Source target: staging / airtrust-db-staging"
  echo "-- Source snapshot: $snapshot_path"
  echo "-- Approval: $approval"
  echo "-- Scope: schema-only baseline artifact; excludes d1_migrations; no D1 remote; no deploy; no 0389 apply"
  echo
  sqlite3 "$snapshot_path" <<'SQL'
.mode list
SELECT sql || ';'
FROM sqlite_master
WHERE sql IS NOT NULL
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%'
  AND name <> 'd1_migrations'
ORDER BY
  CASE type
    WHEN 'table' THEN 1
    WHEN 'index' THEN 2
    WHEN 'trigger' THEN 3
    WHEN 'view' THEN 4
    ELSE 5
  END,
  name;
SQL
} > "$tmp_baseline"

perl -pi -e 's/[ \t]+$//' "$tmp_baseline"

if LC_ALL=C grep -Eiq '(^|[^a-z])(user_platform_roles|support_access_sessions)([^a-z]|$)' "$tmp_baseline"; then
  fail "generated_baseline_contains_0389_objects"
fi

if LC_ALL=C grep -Eiq 'CREATE[[:space:]]+TABLE[^;]+d1_migrations' "$tmp_baseline"; then
  fail "generated_baseline_contains_d1_migrations"
fi

mv "$tmp_baseline" "$baseline_output"
trap - EXIT

table_count="$(
  sqlite3 "$snapshot_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations';"
)"
index_count="$(
  sqlite3 "$snapshot_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"
)"
trigger_count="$(
  sqlite3 "$snapshot_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"
)"
view_count="$(
  sqlite3 "$snapshot_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='view' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';"
)"
object_count=$((table_count + index_count + trigger_count + view_count))
baseline_sha="$(shasum -a 256 "$baseline_output" | awk '{print $1}')"

cat > "$summary_output" <<EOF
MIG01_STAGING_REBASELINE=COMPLETED
target=staging
approval=$approval
snapshot_integrity=$integrity
tables=$table_count
indexes=$index_count
triggers=$trigger_count
views=$view_count
schema_objects=$object_count
baseline_output=$baseline_output
baseline_sha256=$baseline_sha
d1_migrations_excluded=YES
objects_0389_included=NO
remote_d1=NO
deploy=NO
production=NO
historical_migrations_edited=NO
EOF

echo "MIG01_STAGING_REBASELINE=COMPLETED"
echo "TARGET=staging"
echo "APPROVAL=DECLARED"
echo "SNAPSHOT_INTEGRITY=$integrity"
echo "TABLES=$table_count"
echo "INDEXES=$index_count"
echo "TRIGGERS=$trigger_count"
echo "VIEWS=$view_count"
echo "SCHEMA_OBJECTS=$object_count"
echo "BASELINE_OUTPUT=$baseline_output"
echo "BASELINE_SHA256=$baseline_sha"
echo "D1_MIGRATIONS_EXCLUDED=YES"
echo "OBJECTS_0389_INCLUDED=NO"
echo "REMOTE_D1=NO"
echo "DEPLOY=NO"
echo "PRODUCTION=NO"
echo "HISTORICAL_MIGRATIONS_EDITED=NO"
