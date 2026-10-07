#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0537 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_positive(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" =~ ^[0-9]+$ && "$count" -gt 0 ]] || { echo "ERROR: $label expected>0 found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label:$count"; }
bash scripts/staging/validate-0536-postconditions.sh --target="$target"
assert_count dependency-0536-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0536_training_compliance_fdm_three_audiences.sql';"
assert_count unapplied-0537 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0537_training_catalog_source_backed_metadata.sql';"
assert_positive ptm-rev07-reference-still-present "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND COALESCE(referencias,'') LIKE '%PRG-MNT-002 — PTM Rev.07%';"
assert_count doutrinacao-source-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='MNT_INTEGRACAO_DOUTRINACAO' AND carga_horaria_inicial=8 AND carga_horaria_recorrente=4 AND ativo=1 AND deleted_at IS NULL;"
assert_count manual-models-without-fabricated-hours 3 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('MNT_MGM','MNT_MOM','MNT_MCQ') AND carga_horaria IS NULL AND carga_horaria_inicial IS NULL AND carga_horaria_recorrente IS NULL AND ativo=1 AND deleted_at IS NULL;"
assert_count lgpd-hours-unset 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='LGPD' AND carga_horaria IS NULL AND carga_horaria_inicial IS NULL AND carga_horaria_recorrente IS NULL AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-new-hours-unset 2 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('FDM-TRIPULACAO','FDM-COMITE-GATEKEEPER') AND carga_horaria IS NULL AND carga_horaria_inicial IS NULL AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_CATALOG_SOURCE_BACKED_METADATA_0537_STAGING_PREFLIGHT=PASS
