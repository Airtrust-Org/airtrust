#!/usr/bin/env bash
# source_reference: worker-airtrust/schema-v2/conhecimento-ativo-foundation-0502.json
# operational_decision: staging-only read validation for Conhecimento Ativo 0502
# dry_run_required: true
# rollback_plan_required: worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0502.md
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
MIGRATION_BASENAME="0502_conhecimento_ativo_foundation.sql"

target=""
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || {
  echo "ERROR: staging 0502 validator refused target: $target" >&2
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
assert_count conhecimento-ativo-tables 13 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'conhecimento_ativo_%';"
assert_count conhecimento-ativo-triggers 9 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_ca_%';"
assert_count importacoes-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_ca_importacoes_hash';"
assert_count desafio-idempotencia-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_ca_desafios_periodo_active';"
assert_count respostas-once-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_ca_respostas_once';"

echo CONHECIMENTO_ATIVO_FOUNDATION_0502_STAGING_POSTCONDITIONS=PASS
