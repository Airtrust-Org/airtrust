#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0540 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('['),e=d.lastIndexOf(']');const p=JSON.parse(s>=0?d.slice(s,e+1):d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_at_most_one(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" =~ ^[0-9]+$ && "$count" -le 1 ]] || { echo "ERROR: $label expected<=1 found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label:$count"; }
bash scripts/staging/validate-0536-postconditions.sh --target="$target"
assert_count dependency-0536-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0536_training_compliance_fdm_three_audiences.sql';"
assert_count unapplied-0537 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0537_training_catalog_source_backed_metadata.sql';"
assert_count unapplied-0538 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0538_training_compliance_manager_designation_nr05.sql';"
assert_count unapplied-0539 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0539_training_doutrinacao_bootstrap.sql';"
assert_count unapplied-0540 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0540_training_maintenance_catalog_identities_bootstrap.sql';"
assert_count maintenance-area 1 "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL;"
assert_at_most_one doutrinacao-category "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='TREINAMENTO-DE-DOUTRINACAO' OR UPPER(TRIM(nome))='TREINAMENTO DE DOUTRINAÇÃO');"
for code in MNT_MGM MNT_MOM MNT_MCQ; do
  assert_at_most_one "manual-$code" "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='$code';"
done
echo TRAINING_MAINTENANCE_MANUALS_BOOTSTRAP_0540_STAGING_PREFLIGHT=PASS
