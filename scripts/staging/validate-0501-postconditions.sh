#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
MIGRATION_BASENAME="0501_controle_voos_leg_operational_weights.sql"

target=""
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || {
  echo "ERROR: staging 0501 validator refused target: $target" >&2
  exit 1
}

query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, db, sql] = process.argv;
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql],
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(1);
}
const start = result.stdout.indexOf('[');
const end = result.stdout.lastIndexOf(']');
const payload = JSON.parse(start >= 0 && end > start ? result.stdout.slice(start, end + 1) : result.stdout);
const row = (Array.isArray(payload) ? payload[0]?.results : payload?.results)?.[0];
const value = Number(row?.count ?? row?.total ?? row?.['COUNT(*)'] ?? (row ? Object.values(row)[0] : NaN));
if (!Number.isInteger(value) || value < 0) throw new Error('INVALID_COUNT');
process.stdout.write(String(value));
NODE
}

assert_count() {
  local label="$1" expected="$2" sql="$3" count
  count="$(query_count "$sql")"
  [[ "$count" == "$expected" ]] || {
    echo "ERROR: $label expected=$expected found=$count" >&2
    exit 1
  }
  echo "POSTCONDITION_OK=$label"
}

assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count aircraft-weight-columns 2 "SELECT COUNT(*) count FROM pragma_table_info('aeronaves') WHERE name IN ('peso_vazio','unidade_peso');"
assert_count stage-operational-columns 7 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_etapas') WHERE name IN ('peso_passageiros','peso_bagagem','peso_tripulacao','peso_vazio','peso_total','unidade_peso','observacoes');"
assert_count tenant6-petrobras-active 1 "SELECT COUNT(*) count FROM cv_naturezas_voo WHERE empresa_id=6 AND codigo='PETROBRAS' AND ativo=1 AND deleted_at IS NULL;"

echo CONTROLE_VOOS_LEG_OPERATIONAL_WEIGHTS_0501_STAGING_POSTCONDITIONS=PASS
