#!/usr/bin/env bash
# Read-only postconditions for the governed staging Schema V2 apply of 0438.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
MIGRATION_NAME="0438_controle_voos_rdv_coordenacao_workflow.sql"
CHANGE_ID="0438-rdv-coordination-workflow-production"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: validator 0438 recusou alvo diferente do staging oficial: $target" >&2
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
  ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
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

assert_one() {
  local label="$1"
  local sql="$2"
  local count
  count="$(query_count "$sql")"
  if [[ "$count" != "1" ]]; then
    echo "ERROR: $label esperado=1 encontrado=$count" >&2
    exit 1
  fi
  echo "POSTCONDITION_OK=$label"
}

assert_one "d1_migrations:$MIGRATION_NAME" \
  "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_NAME';"
assert_one "schema_v2:$CHANGE_ID" \
  "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';"

assert_one "cv_rdv_operacional.workflow_status" \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status';"
assert_one "cv_rdv_operacional.workflow_status.default" \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status' AND replace(dflt_value, char(39), '') = 'rascunho';"
assert_one "cv_rdv_operacional.versao" \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'versao';"
assert_one "cv_rdv_operacional.versao.default" \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'versao' AND CAST(dflt_value AS INTEGER) = 1;"

for table in cv_rdv_aprovacoes cv_rdv_revisoes cv_rdv_alertas cv_voo_abastecimentos; do
  assert_one "table:$table" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '$table';"
done

for trigger in \
  trg_cv_rdv_operacional_workflow_status_insert \
  trg_cv_rdv_operacional_workflow_status_update \
  trg_cv_rdv_operacional_versao_insert \
  trg_cv_rdv_operacional_versao_update \
  trg_cv_rdv_aprovacoes_rdv_insert \
  trg_cv_rdv_aprovacoes_no_update \
  trg_cv_rdv_revisoes_rdv_insert \
  trg_cv_rdv_revisoes_no_update \
  trg_cv_rdv_alertas_rdv_insert \
  trg_cv_rdv_alertas_etapa_insert \
  trg_cv_rdv_alertas_keys_immutable \
  trg_cv_voo_abastecimentos_voo_insert \
  trg_cv_voo_abastecimentos_etapa_insert \
  trg_cv_voo_abastecimentos_keys_immutable; do
  assert_one "trigger:$trigger" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = '$trigger';"
done

assert_one "index:idx_cv_voo_etapas_empresa_voo_numero_unique" \
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_voo_etapas_empresa_voo_numero_unique';"

# The uniqueness constraint must be consistent with current active data.
duplicates="$(query_count "SELECT COUNT(*) AS count FROM (SELECT empresa_id, voo_id, numero_etapa FROM cv_voo_etapas WHERE deleted_at IS NULL GROUP BY empresa_id, voo_id, numero_etapa HAVING COUNT(*) > 1);")"
if [[ "$duplicates" != "0" ]]; then
  echo "ERROR: active stage numbering has $duplicates duplicate group(s)." >&2
  exit 1
fi
echo "POSTCONDITION_OK=active-stage-numbering-unique"

echo "RDV_0438_STAGING_POSTCONDITIONS=PASS"
