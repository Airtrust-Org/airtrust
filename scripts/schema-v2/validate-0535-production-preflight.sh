#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: production 0535 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
bash scripts/schema-v2/validate-0534-production-postconditions.sh --target="$target"
assert_count dependency-0534 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-final-matrix-0534' AND baseline_id='$BASELINE_ID';"
assert_count unapplied-0535 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-fdm-three-audiences-0535';"
assert_count canonical-operational-training-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-mnt-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-new-models-absent 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('FDM-TRIPULACAO','FDM-COMITE-GATEKEEPER') AND ativo=1 AND deleted_at IS NULL;"
assert_count separate-formal-designations 2 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('FDM_COMITE','GATEKEEPER') AND tipo='DESIGNACAO' AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_FDM_THREE_AUDIENCES_0535_PRODUCTION_PREFLIGHT=PASS
