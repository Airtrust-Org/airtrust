#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"

fail() {
  echo "[schema-only-export] FAIL: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node_not_found"

STAMP="$(date +%Y%m%d)"
WRITE_SQL="0"
INPUT_JSON=""
OUTPUT_DIR=""
SOURCE_LABEL="production sqlite_master read-only query"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stamp)
      STAMP="${2:?missing_value_for_--stamp}"
      shift 2
      ;;
    --write-sql)
      WRITE_SQL="1"
      shift
      ;;
    --input-json)
      INPUT_JSON="${2:?missing_value_for_--input-json}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:?missing_value_for_--output-dir}"
      shift 2
      ;;
    *)
      fail "unknown_argument:$1"
      ;;
  esac
done

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$ROOT_DIR/docs/controlled-execution/schema-baseline-pre0412-${STAMP}"
fi

mkdir -p "$OUTPUT_DIR"

tmp_json="$(mktemp)"
cleanup() {
  rm -f "$tmp_json"
}
trap cleanup EXIT

QUERY=$(cat <<'SQL'
SELECT type, name, tbl_name, sql
FROM sqlite_master
WHERE sql IS NOT NULL
  AND type IN ('table', 'index', 'view', 'trigger')
ORDER BY
  CASE type
    WHEN 'table' THEN 1
    WHEN 'index' THEN 2
    WHEN 'view' THEN 3
    WHEN 'trigger' THEN 4
    ELSE 5
  END,
  name;
SQL
)

if [[ -n "$INPUT_JSON" ]]; then
  cp "$INPUT_JSON" "$tmp_json"
  SOURCE_LABEL="input_json sqlite_master audit"
else
  command -v npx >/dev/null 2>&1 || fail "npx_not_found"
  [[ -d "$WORKER_DIR" ]] || fail "worker_dir_not_found:$WORKER_DIR"
  (
    cd "$WORKER_DIR"
    npx wrangler d1 execute airtrust-db \
      --env production \
      --remote \
      --command "$QUERY" \
      --json
  ) > "$tmp_json"
fi

node_args=(
  "$ROOT_DIR/scripts/export-d1-schema-only.mjs"
  --input-json "$tmp_json"
  --output-dir "$OUTPUT_DIR"
  --stamp "$STAMP"
  --source-label "$SOURCE_LABEL"
  --source-database-name "airtrust-db"
  --source-database-id "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
)

if [[ "$WRITE_SQL" == "1" ]]; then
  node_args+=(--write-sql)
fi

node "${node_args[@]}" || fail "analysis_failed"

echo "SCHEMA_ONLY_EXPORT=COMPLETED"
echo "OUTPUT_DIR=$OUTPUT_DIR"
echo "OUTPUT_MANIFEST=$OUTPUT_DIR/schema_baseline_manifest.json"
echo "OUTPUT_REPORT=$OUTPUT_DIR/schema_baseline_report.md"
if [[ "$WRITE_SQL" == "1" ]]; then
  echo "OUTPUT_SQL=$OUTPUT_DIR/schema_baseline_pre0412.sql"
fi
