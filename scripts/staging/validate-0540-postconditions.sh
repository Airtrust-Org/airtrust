#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0540 postcondition refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('['),e=d.lastIndexOf(']');const p=JSON.parse(s>=0?d.slice(s,e+1):d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0540 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0540_training_maintenance_manuals_bootstrap.sql';"
assert_count doutrinacao-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-DOUTRINACAO' AND nome='Treinamento de Doutrinação' AND ativo=1 AND deleted_at IS NULL;"
assert_count maintenance-manuals 3 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_areas qa ON qa.id=qt.area_id AND qa.empresa_id=qt.empresa_id JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND qt.codigo IN ('MNT_MGM','MNT_MOM','MNT_MCQ') AND qt.ativo=1 AND qt.deleted_at IS NULL AND qt.carga_horaria IS NULL AND qt.carga_horaria_inicial IS NULL AND qt.carga_horaria_recorrente IS NULL AND qa.codigo='MANUTENCAO' AND qa.ativo=1 AND qa.deleted_at IS NULL AND qc.codigo='TREINAMENTO-DE-DOUTRINACAO' AND qc.ativo=1 AND qc.deleted_at IS NULL;"
assert_count maintenance-manual-total 3 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('MNT_MGM','MNT_MOM','MNT_MCQ');"
bash scripts/staging/validate-0536-postconditions.sh --target="$target"
echo TRAINING_MAINTENANCE_MANUALS_BOOTSTRAP_0540_STAGING_POSTCONDITIONS=PASS
