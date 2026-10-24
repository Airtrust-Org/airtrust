#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-qualification-catalog-placeholders-0530"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0530 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
CODES="'REGRAS_OURO_PETROBRAS','JUST_CULTURE','STOP_WORK','ETICA_CONDUTA','LGPD_SEG_INFO'"
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count tenant-6 1 "SELECT COUNT(*) count FROM empresas WHERE id=6;"
assert_count canonical-ead-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(codigo))='EAD';"
assert_count duplicate-active-target-models 0 "SELECT COUNT(*) count FROM (SELECT UPPER(codigo) code,COUNT(*) n FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES) GROUP BY UPPER(codigo) HAVING COUNT(*)>1);"
assert_count inactive-target-models 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES) AND ativo<>1;"
echo TRAINING_QUALIFICATION_CATALOG_0530_PRODUCTION_PREFLIGHT=PASS
