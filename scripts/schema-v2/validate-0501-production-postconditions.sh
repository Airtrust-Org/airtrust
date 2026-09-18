#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="controle-voos-leg-operational-weights-0501"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0501 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count aeronaves-new-columns 2 "SELECT COUNT(*) count FROM pragma_table_info('aeronaves') WHERE name IN ('peso_vazio','unidade_peso');"
assert_count etapas-new-columns 7 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_etapas') WHERE name IN ('peso_passageiros','peso_bagagem','peso_tripulacao','peso_vazio','peso_total','unidade_peso','observacoes');"
assert_count natureza-petrobras-active 1 "SELECT COUNT(*) count FROM cv_naturezas_voo WHERE empresa_id=6 AND codigo='PETROBRAS' AND ativo=1 AND deleted_at IS NULL;"
assert_count natureza-petrobras-no-duplicate 0 "SELECT COUNT(*) count FROM (SELECT empresa_id,codigo,COUNT(*) n FROM cv_naturezas_voo WHERE empresa_id=6 AND codigo='PETROBRAS' AND deleted_at IS NULL GROUP BY empresa_id,codigo HAVING n>1);"
echo CONTROLE_VOOS_LEG_OPERATIONAL_WEIGHTS_0501_PRODUCTION_POSTCONDITIONS=PASS
