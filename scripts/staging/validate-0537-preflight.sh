#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0537 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
bash scripts/staging/validate-0536-postconditions.sh --target="$target"
assert_count dependency-0536 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0536_training_compliance_fdm_three_audiences.sql';"
assert_count unapplied-0537 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0537_training_catalog_metadata_completeness.sql';"
assert_count target-core-models 10 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(codigo)) IN ('A','LGPD','NR-05','NR-20','MNT_INTEGRACAO_DOUTRINACAO','MNT_MGM','MNT_MOM','MNT_MCQ','FDM-MECANICO','BOWTIEXP');"
assert_count fdm-0536-models 2 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(codigo)) IN ('FDM-TRIPULACAO','FDM-COMITE-GATEKEEPER');"
assert_count fdm-0536-unspecified-hours 2 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(codigo)) IN ('FDM-TRIPULACAO','FDM-COMITE-GATEKEEPER') AND carga_horaria IS NULL;"
assert_count nr05-prestate 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-05' AND categoria='EAD' AND carga_horaria IS NULL AND ativo=1 AND deleted_at IS NULL;"
assert_count nr20-prestate 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND carga_horaria=2 AND carga_horaria_inicial=2 AND carga_horaria_recorrente=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count lgpd-prestate 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LGPD' AND carga_horaria IS NULL AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_CATALOG_METADATA_COMPLETENESS_0537_STAGING_PREFLIGHT=PASS
