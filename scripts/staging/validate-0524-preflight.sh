#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0524 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count dependency-0517 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0517_training_compliance_conditions.sql';"
assert_count dependency-0518 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0518_crm_qualification_consolidation.sql';"
assert_count dependency-0521 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0521_training_compliance_designation_overrides.sql';"
assert_count dependency-0523 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0523_training_compliance_governed_designation_rules.sql';"
assert_count migration-ledger-0524-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0524_training_compliance_requirement_sanitization.sql';"
assert_count required-models 3 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('FDM-EAD','MNT_AW139','MNT_S76AC') AND ativo=1 AND deleted_at IS NULL;"
assert_count required-maintenance-functions 2 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND nome IN ('Mecânico','Auxiliar de Manutenção') AND ativo=1 AND deleted_at IS NULL;"
assert_count governed-rbac119-exclusions 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo LIKE 'RBAC119_%' AND tr.obrigatoriedade='NAO_APLICA' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='PADRAO_EXCLUSAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_REQUIREMENT_SANITIZATION_0524_STAGING_PREFLIGHT=PASS