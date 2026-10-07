#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0534 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count migration-ledger-0533 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0533_training_catalog_metadata_references.sql';"
assert_count migration-ledger-0534-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0534_training_compliance_final_matrix.sql';"
assert_count nr20-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL;"
assert_count d2-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='D2' AND ativo=1 AND deleted_at IS NULL;"
assert_count petro-ouro-evidence-model 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PETRO-OURO' AND ativo=1 AND deleted_at IS NULL;"
assert_count regras-ouro-unused-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='REGRAS_OURO_PETROBRAS' AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-mecanico-absent 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;"
assert_count bowtiexp-absent 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='BOWTIEXP' AND ativo=1 AND deleted_at IS NULL;"
assert_count required-conditions 9 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND codigo IN ('BRIGADISTA','MEMBRO_CIPA','SOCORRISTA_DESIGNADO','LOSA_OBSERVADOR','RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC119_PILOTO_CHEFE');"
echo TRAINING_COMPLIANCE_FINAL_MATRIX_0534_STAGING_PREFLIGHT=PASS
