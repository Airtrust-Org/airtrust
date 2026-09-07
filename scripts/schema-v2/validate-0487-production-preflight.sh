#!/usr/bin/env bash
# Read-only fail-closed production preflight for reviewed Schema V2 change 0487.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="qualificacoes-renovacoes-0487"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: 0487 production preflight refused target: $target" >&2
  exit 1
fi

query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, dbName, sql] = process.argv;
const res = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', dbName, '--env', 'production', '--remote', '--json', '--command', sql],
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env },
);
if (res.status !== 0) {
  process.stderr.write(`wrangler failed with code ${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}\n`);
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(res.stdout);
} catch {
  const start = res.stdout.indexOf('[');
  const end = res.stdout.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error(`D1_JSON_NOT_FOUND:${res.stdout}`);
  parsed = JSON.parse(res.stdout.slice(start, end + 1));
}
const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
const row = results?.[0];
const value = row?.count ?? row?.COUNT ?? row?.total ?? row?.TOTAL ?? row?.['COUNT(*)'] ?? row?.['count(*)'] ?? (row ? Object.values(row)[0] : NaN);
const count = Number(value);
if (!Number.isInteger(count) || count < 0) throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);
process.stdout.write(String(count));
NODE
}

baseline_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id = '$BASELINE_ID' AND status = 'ACTIVE';")"
[[ "$baseline_count" == "1" ]] || { echo "ERROR: expected active baseline $BASELINE_ID" >&2; exit 1; }

change_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';")"
[[ "$change_count" == "0" ]] || { echo "ERROR: $CHANGE_ID already exists in Schema V2 ledger" >&2; exit 1; }

history_count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'qualificacoes_historico';")"
[[ "$history_count" == "1" ]] || { echo "ERROR: prerequisite table qualificacoes_historico is absent" >&2; exit 1; }

table_count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'qualificacoes_renovacoes';")"
[[ "$table_count" == "0" ]] || {
  echo "ERROR: QUALIFICACOES_RENOVACOES_SCHEMA_DRIFT: table already exists without reviewed 0487 ledger row" >&2
  exit 1
}

echo "QUALIFICACOES_RENOVACOES_0487_PRODUCTION_PREFLIGHT=PASS"
