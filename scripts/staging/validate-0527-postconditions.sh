#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0527 postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0527 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0527_training_compliance_loft_bootstrap.sql';"
assert_count loft-active 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL;"
assert_count loft-operational-category 1 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='LOFT' AND qt.ativo=1 AND qt.deleted_at IS NULL AND UPPER(TRIM(qc.codigo))='TREINAMENTO_OPERACIONAL' AND qc.ativo=1 AND qc.deleted_at IS NULL;"
assert_count loft-current-validity-present 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL AND validade IS NOT NULL AND validade>0;"
assert_count alignment-0526-still-unapplied 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0526_training_compliance_matrix_alignment.sql';"
echo TRAINING_COMPLIANCE_LOFT_BOOTSTRAP_0527_STAGING_POSTCONDITIONS=PASS
