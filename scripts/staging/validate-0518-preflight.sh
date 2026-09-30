#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0518 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_zero_or_one(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" == "0" || "$count" == "1" ]] || { echo "ERROR: $label expected=0-or-1 found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label:$count"; }

assert_count category-contract-column 1 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_categorias') WHERE name='lms_integrada';"
assert_count conflicting-theory-category 0 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE (id=3 OR (empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='TERICO' OR UPPER(TRIM(nome))='TEÓRICO'))) AND NOT (id=3 AND empresa_id=6 AND UPPER(TRIM(codigo))='TERICO' AND UPPER(TRIM(nome))='TEÓRICO' AND ativo=1 AND deleted_at IS NULL AND COALESCE(lms_integrada,0)=0 AND COALESCE(dominio_codigo,'')='OPERACOES');"
assert_zero_or_one canonical-theory-category "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE id=3 AND empresa_id=6 AND UPPER(TRIM(codigo))='TERICO' AND UPPER(TRIM(nome))='TEÓRICO' AND ativo=1 AND deleted_at IS NULL AND COALESCE(lms_integrada,0)=0 AND COALESCE(dominio_codigo,'')='OPERACOES';"
assert_count conflicting-crm-corp 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL AND NOT (ativo=1 AND categoria_id=3 AND area_id=4 AND COALESCE(classe_requisito,'')='TREINAMENTO' AND COALESCE(dominio_codigo,'')='CORPORATIVO');"
assert_zero_or_one canonical-crm-corp "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND ativo=1 AND deleted_at IS NULL AND categoria_id=3 AND area_id=4 AND COALESCE(classe_requisito,'')='TREINAMENTO' AND COALESCE(dominio_codigo,'')='CORPORATIVO';"
assert_zero_or_one crm-corp-company-rule "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count conflicting-ead-category 0 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE (id=13 OR (empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD'))) AND NOT (id=13 AND empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND UPPER(TRIM(nome))='EAD' AND ativo=1 AND deleted_at IS NULL AND COALESCE(lms_integrada,0)=1);"
assert_zero_or_one canonical-ead-category "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND id=13 AND UPPER(TRIM(codigo))='EAD' AND UPPER(TRIM(nome))='EAD' AND ativo=1 AND deleted_at IS NULL AND COALESCE(lms_integrada,0)=1;"
assert_count conflicting-ead-format 0 "SELECT COUNT(*) count FROM qualificacoes_formatos WHERE (id=1 OR (empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD'))) AND NOT (id=1 AND empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND UPPER(TRIM(nome))='EAD' AND ativo=1 AND deleted_at IS NULL);"
assert_zero_or_one canonical-ead-format "SELECT COUNT(*) count FROM qualificacoes_formatos WHERE empresa_id=6 AND id=1 AND UPPER(TRIM(codigo))='EAD' AND UPPER(TRIM(nome))='EAD' AND ativo=1 AND deleted_at IS NULL;"
assert_count competing-lms-category 0 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND COALESCE(lms_integrada,0)=1 AND ativo=1 AND deleted_at IS NULL AND id<>13;"
assert_count safety-area 1 "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL;"
echo CRM_QUALIFICATION_CONSOLIDATION_0518_STAGING_PREFLIGHT=PASS
