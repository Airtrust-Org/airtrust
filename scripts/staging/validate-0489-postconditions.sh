#!/usr/bin/env bash
# Read-only staging postconditions for A-02 migration 0489.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

[[ "$target" == "$ALLOWED_DB_NAME" ]] || {
  echo "ERROR: 0489 staging postconditions refused target: $target" >&2
  exit 1
}

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

assert_count() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local count
  count="$(query_count "$sql")"
  [[ "$count" == "$expected" ]] || {
    echo "ERROR: $label expected=$expected found=$count" >&2
    exit 1
  }
  echo "POSTCONDITION_OK=$label"
}


for idx in ux_funcionarios_cpf_empresa_active ux_funcionarios_matricula_empresa_active ux_funcionarios_email_empresa_active; do
  assert_count "index:$idx" "1" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = '$idx';"
  assert_count "unique-index:$idx" "1" "SELECT COUNT(*) AS count FROM pragma_index_list('funcionarios') WHERE name = '$idx' AND \"unique\" = 1;"
done

assert_count "cpf-index-contract" "1" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='ux_funcionarios_cpf_empresa_active' AND sql LIKE '%empresa_id, cpf%' AND sql LIKE '%deleted_at IS NULL%';"
assert_count "matricula-index-contract" "1" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='ux_funcionarios_matricula_empresa_active' AND UPPER(sql) LIKE '%EMPRESA_ID, TRIM(MATRICULA)%' AND sql LIKE '%deleted_at IS NULL%';"
assert_count "email-index-contract" "1" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='ux_funcionarios_email_empresa_active' AND UPPER(sql) LIKE '%EMPRESA_ID, LOWER(TRIM(EMAIL))%' AND sql LIKE '%deleted_at IS NULL%';"

assert_count "tenant-index:qualificacoes_tipos.codigo" "1" "SELECT COUNT(*) AS count FROM pragma_index_list('qualificacoes_tipos') WHERE name = 'idx_qualificacoes_tipos_codigo_empresa_active' AND \"unique\" = 1;"
assert_count "global-legacy-unique-indexes" "0" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('ux_funcionarios_cpf','ux_funcionarios_matricula','ux_funcionarios_email','ux_qualificacoes_tipos_codigo');"
assert_count "global-natural-key-unique-indexes" "0" "SELECT COUNT(*) AS count FROM pragma_index_list('funcionarios') AS il WHERE il.\"unique\" = 1 AND NOT EXISTS (SELECT 1 FROM pragma_index_info(il.name) AS ii WHERE ii.name = 'empresa_id') AND (EXISTS (SELECT 1 FROM pragma_index_info(il.name) AS ii WHERE ii.name IN ('cpf','matricula','email')) OR EXISTS (SELECT 1 FROM sqlite_master AS sm WHERE sm.type = 'index' AND sm.name = il.name AND sm.sql IS NOT NULL AND (LOWER(sm.sql) LIKE '%cpf%' OR LOWER(sm.sql) LIKE '%matricula%' OR LOWER(sm.sql) LIKE '%email%')));"
assert_count "ambiguous-legacy-indexes" "0" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_funcionarios_cpf','idx_funcionarios_matricula');"

assert_count "duplicate-cpf" "0" "SELECT COUNT(*) AS count FROM (SELECT empresa_id, cpf FROM funcionarios WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != '' GROUP BY empresa_id, cpf HAVING COUNT(*) > 1);"
assert_count "duplicate-matricula" "0" "SELECT COUNT(*) AS count FROM (SELECT empresa_id, TRIM(matricula) AS k FROM funcionarios WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != '' GROUP BY empresa_id, TRIM(matricula) HAVING COUNT(*) > 1);"
assert_count "duplicate-email" "0" "SELECT COUNT(*) AS count FROM (SELECT empresa_id, LOWER(TRIM(email)) AS k FROM funcionarios WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != '' GROUP BY empresa_id, LOWER(TRIM(email)) HAVING COUNT(*) > 1);"

echo "A02_NATURAL_KEYS_0489_STAGING_POSTCONDITIONS=PASS"
