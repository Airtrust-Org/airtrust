#!/usr/bin/env bash
# Read-only production postconditions for Schema V2 change 0493.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="simulator-annual-curriculum-cycles-0493"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0493 production postconditions refused target: $target" >&2; exit 1; }
query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process'); const path=require('node:path'); const [,,dbName,sql]=process.argv;
const res=spawnSync('npx',['wrangler','d1','execute',dbName,'--env','production','--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});
if(res.status!==0){process.stderr.write(res.stderr||res.stdout);process.exit(1)} let parsed;try{parsed=JSON.parse(res.stdout)}catch{const s=res.stdout.indexOf('['),e=res.stdout.lastIndexOf(']');if(s<0||e<=s)throw new Error('D1_JSON_NOT_FOUND');parsed=JSON.parse(res.stdout.slice(s,e+1))} const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0]; const value=row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN); const count=Number(value);if(!Number.isInteger(count)||count<0)throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "active-baseline" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count "schema-v2-change" 1 "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count "cycle-tables" 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('simuladores_curriculos_voo_config','simuladores_curriculos_voo_itens');"
assert_count "cycle-indexes" 4 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN ('idx_sim_curr_voo_config_active','idx_sim_curr_voo_itens_order_active','idx_sim_curr_voo_itens_code_active','idx_sim_curr_voo_itens_model');"
assert_count "cycle-triggers" 2 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_sim_curr_voo_config_tenant_insert','trg_sim_curr_voo_itens_guard_insert');"
assert_count "cycle-config-count" 3 "SELECT COUNT(*) AS count FROM simuladores_curriculos_voo_config c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL AND qt.codigo IN ('G1','G1-SEM','G2');"
assert_count "cycle-config-mismatch" 0 "SELECT COUNT(*) AS count FROM simuladores_curriculos_voo_config c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL AND qt.codigo IN ('G1','G1-SEM','G2') AND NOT (c.total_ciclos=3 AND c.ano_base=2026 AND c.ciclo_ano_base=2);"
assert_count "curriculum-item-total" 27 "SELECT COUNT(*) AS count FROM simuladores_curriculos_voo_itens WHERE empresa_id=6 AND deleted_at IS NULL;"
assert_count "curriculum-group-count" 9 "SELECT COUNT(*) AS count FROM (SELECT qualificacao_tipo_id,ciclo FROM simuladores_curriculos_voo_itens WHERE empresa_id=6 AND deleted_at IS NULL GROUP BY qualificacao_tipo_id,ciclo);"
assert_count "curriculum-cardinality-mismatch" 0 "SELECT COUNT(*) AS count FROM (SELECT qt.codigo,i.ciclo,COUNT(*) AS n FROM simuladores_curriculos_voo_itens i JOIN qualificacoes_tipos qt ON qt.id=i.qualificacao_tipo_id AND qt.empresa_id=i.empresa_id WHERE i.empresa_id=6 AND i.deleted_at IS NULL GROUP BY qt.codigo,i.ciclo HAVING NOT ((qt.codigo='G1' AND COUNT(*)=4) OR (qt.codigo='G1-SEM' AND COUNT(*)=2) OR (qt.codigo='G2' AND COUNT(*)=3)));"
assert_count "curriculum-unresolved-current-model" 0 "SELECT COUNT(*) AS count FROM simuladores_curriculos_voo_itens i LEFT JOIN modelos_sessao_versionamento v ON v.empresa_id=i.empresa_id AND v.codigo_canonico=i.codigo_canonico AND v.is_current=1 LEFT JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id WHERE i.empresa_id=6 AND i.deleted_at IS NULL AND (v.modelo_id IS NULL OR ms.id IS NULL OR ms.deleted_at IS NOT NULL OR COALESCE(ms.ativo,1)<>1);"
assert_count "curriculum-order-gaps" 0 "SELECT COUNT(*) AS count FROM (SELECT qualificacao_tipo_id,ciclo,COUNT(*) AS n,MIN(ordem) AS min_o,MAX(ordem) AS max_o,COUNT(DISTINCT ordem) AS d FROM simuladores_curriculos_voo_itens WHERE empresa_id=6 AND deleted_at IS NULL GROUP BY qualificacao_tipo_id,ciclo HAVING min_o<>1 OR max_o<>n OR d<>n);"
echo "SIMULATOR_ANNUAL_CURRICULUM_CYCLES_0493_PRODUCTION_POSTCONDITIONS=PASS"
