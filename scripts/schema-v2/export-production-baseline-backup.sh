#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
CONTRACT_PATH="$ROOT_DIR/docs/database/schema-contracts/production-d1-baseline-v2.json"
BASELINE_PATH="$WORKER_DIR/schema-v2/baseline/production-20260714.json"
BOOTSTRAP_PATH="$WORKER_DIR/schema-v2/bootstrap/0000_initialize_schema_ledger_v2.sql"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_DIR="${1:-$HOME/.airtrust-prod-ops/schema-baseline-v2/$TIMESTAMP}"

fail() {
  echo "SCHEMA_BASELINE_V2_BACKUP=FAILED"
  echo "REASON=$1"
  exit 2
}

[[ -f "$CONTRACT_PATH" ]] || fail "contract_missing"
[[ -f "$BASELINE_PATH" ]] || fail "baseline_missing"
[[ -f "$BOOTSTRAP_PATH" ]] || fail "bootstrap_missing"

mkdir -p "$OUTPUT_DIR"

query() {
  local sql="$1"
  (
    cd "$WORKER_DIR"
    npx wrangler d1 execute airtrust-db --env production --remote --json --command "$sql"
  )
}

query "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name;" > "$OUTPUT_DIR/sqlite_master.json"
query "PRAGMA table_list;" > "$OUTPUT_DIR/pragma_table_list.json"
query "SELECT id, name, applied_at FROM d1_migrations ORDER BY id;" > "$OUTPUT_DIR/d1_migrations.json"

cp "$CONTRACT_PATH" "$OUTPUT_DIR/contract.json"
cp "$BASELINE_PATH" "$OUTPUT_DIR/baseline.json"
cp "$BOOTSTRAP_PATH" "$OUTPUT_DIR/bootstrap.sql"

cat > "$OUTPUT_DIR/metadata.json" <<JSON
{
  "timestamp_utc": "$TIMESTAMP",
  "main_sha": "$(git -C "$ROOT_DIR" rev-parse HEAD)",
  "worker_sha": "6d4fe1e8d3ca3b761a23c3c78662a273d1b85f97",
  "contract_path": "docs/database/schema-contracts/production-d1-baseline-v2.json",
  "baseline_path": "worker-airtrust/schema-v2/baseline/production-20260714.json",
  "bootstrap_path": "worker-airtrust/schema-v2/bootstrap/0000_initialize_schema_ledger_v2.sql"
}
JSON

(cd "$OUTPUT_DIR" && shasum -a 256 baseline.json bootstrap.sql contract.json d1_migrations.json metadata.json pragma_table_list.json sqlite_master.json > SHA256SUMS.txt)

echo "SCHEMA_BASELINE_V2_BACKUP=COMPLETED"
echo "OUTPUT_DIR=$OUTPUT_DIR"
