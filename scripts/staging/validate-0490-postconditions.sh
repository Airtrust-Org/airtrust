#!/usr/bin/env bash
# Read-only staging postconditions for migration 0490.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
MIGRATION_NAME="0490_simulator_planning_curriculum_metadata.sql"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0490 staging postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; node - "$target" "$sql" <<'NODE'
const {spawnSync}=require('node:child_process');const path=require('node:path');const[,,dbName,sql]=process.argv;const res=spawnSync('npx',['wrangler','d1','execute',dbName,'--remote','--json','--command',sql],{cwd:path.join(process.cwd(),'worker-airtrust'),encoding:'utf8',env:process.env});if(res.status!==0){process.stderr.write(res.stderr||res.stdout);process.exit(1)}let parsed;try{parsed=JSON.parse(res.stdout)}catch{const s=res.stdout.indexOf('['),e=res.stdout.lastIndexOf(']');if(s<0||e<=s)throw new Error('D1_JSON_NOT_FOUND');parsed=JSON.parse(res.stdout.slice(s,e+1))}const row=(Array.isArray(parsed)?parsed[0]?.results:parsed?.results)?.[0];const value=row?.count??row?.total??row?.['COUNT(*)']??(row?Object.values(row)[0]:NaN);const count=Number(value);if(!Number.isInteger(count)||count<0)throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);process.stdout.write(String(count));
NODE
}
assert_count(){ local label="$1" expected="$2" sql="$3"; local count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count "migration-ledger" 1 "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_NAME';"
assert_count "recurrent-duration-120" 25 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id WHERE v.empresa_id=6 AND v.is_current=1 AND ms.duracao_estimada=120 AND v.codigo_canonico IN ('A139-P-01/04-C1','A139-P-01/04-C2','A139-P-01/04-C3','A139-P-02/04-C1-OFFSHORE','A139-P-02/04-C2-OFFSHORE','A139-P-02/04-C3-OFFSHORE','A139-P-03/04-C1-IFR-LOFT','A139-P-03/04-C2-IFR-LOFT','A139-P-03/04-C3-IFR-LOFT','A139-P-04/04-C1-CHECK','A139-P-04/04-C2-CHECK','A139-P-04/04-C3-CHECK','A139-S-01/02-C1','A139-S-01/02-C2','A139-S-01/02-C3','A139-S-02/02-C1','A139-S-02/02-C2','A139-S-02/02-C3','S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3','S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3','S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3','S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3','SK76-P-CHECK');"
assert_count "ordered-curriculum-count" 9 "SELECT COUNT(*) AS count FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id WHERE v.empresa_id=6 AND v.is_current=1 AND qt.codigo IN ('G1','G1-SEM','G2') AND ms.ordem_no_treinamento IS NOT NULL;"
assert_count "dependency-trigger" 1 "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name='trg_training_dependency_plan_enrich' AND sql LIKE '%ordem_no_treinamento IS NOT NULL%';"
assert_count "open-dependency-unordered-models" 0 "SELECT COUNT(*) AS count FROM treinamentos_planejados t, json_each(t.planejamento_snapshot_json,'$.curriculum_model_ids') j LEFT JOIN modelos_sessao ms ON ms.id=CAST(j.value AS INTEGER) AND ms.empresa_id=t.empresa_id WHERE t.deleted_at IS NULL AND t.planejamento_origem='SIMULADOR_QUINZENA' AND t.planejamento_status IN ('PROPOSTO','PLANEJADO','AGUARDANDO_DISPONIBILIDADE','CONFIRMADO','REPLANEJAR') AND json_valid(COALESCE(t.planejamento_snapshot_json,''))=1 AND json_extract(t.planejamento_snapshot_json,'$.generated_by')='TRAINING_DEPENDENCY' AND (ms.id IS NULL OR ms.ordem_no_treinamento IS NULL);"
echo "SIMULATOR_PLANNING_CURRICULUM_0490_STAGING_POSTCONDITIONS=PASS"
