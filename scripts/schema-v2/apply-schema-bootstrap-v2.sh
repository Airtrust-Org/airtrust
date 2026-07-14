#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
CONTRACT_PATH="$ROOT_DIR/docs/database/schema-contracts/production-d1-baseline-v2.json"
BOOTSTRAP_PATH="$WORKER_DIR/schema-v2/bootstrap/0000_initialize_schema_ledger_v2.sql"
CONFIRM_TEXT="AIRTRUST_SCHEMA_BASELINE_V2"

fail() {
  echo "SCHEMA_BASELINE_V2_APPLY=FAILED"
  echo "REASON=$1"
  exit 2
}

[[ "${AIRTRUST_ALLOW_PROD_SCHEMA_BASELINE_V2:-}" == "YES" ]] || fail "allow_flag_missing"
[[ "${AIRTRUST_CONFIRM_PROD_SCHEMA_BASELINE_V2:-}" == "$CONFIRM_TEXT" ]] || fail "confirmation_invalid"
[[ -f "$CONTRACT_PATH" ]] || fail "contract_missing"
[[ -f "$BOOTSTRAP_PATH" ]] || fail "bootstrap_missing"

check_json="$(node --experimental-strip-types "$ROOT_DIR/scripts/schema-contract/check-schema-contract.ts" --contract "$CONTRACT_PATH" --production)"
status="$(printf '%s' "$check_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).status));")"
schema_hash="$(printf '%s' "$check_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).schemaHash));")"
expected_hash="$(node -e "const c=require('$CONTRACT_PATH'); console.log(c.schema_hash)")"

[[ "$status" == "PASS" ]] || fail "contract_check_not_pass:$status"
[[ "$schema_hash" == "$expected_hash" ]] || fail "schema_hash_changed_after_audit"

(
  cd "$WORKER_DIR"
  npx wrangler d1 execute airtrust-db --env production --remote --file "$BOOTSTRAP_PATH"
)

post_json="$(node --experimental-strip-types "$ROOT_DIR/scripts/schema-contract/check-schema-contract.ts" --contract "$CONTRACT_PATH" --production)"
post_status="$(printf '%s' "$post_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).status));")"
[[ "$post_status" == "PASS" ]] || fail "post_contract_check_not_pass:$post_status"

baseline_row="$(
  cd "$WORKER_DIR" && \
  npx wrangler d1 execute airtrust-db --env production --remote --json --command \
  "SELECT baseline_id, schema_hash, source_commit, source_worker_sha, plan_hash, status FROM airtrust_schema_baselines_v2 WHERE baseline_id = 'production-d1-baseline-v2-20260714';"
)"

echo "SCHEMA_BASELINE_V2_APPLY=COMPLETED"
echo "SCHEMA_HASH=$schema_hash"
echo "BASELINE_ROW_JSON=$baseline_row"
