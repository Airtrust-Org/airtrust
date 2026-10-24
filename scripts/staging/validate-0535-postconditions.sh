#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0535 postcondition refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0535 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0535_training_compliance_integra_bootstrap.sql';"
assert_count integra-canonical-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND qt.codigo='INTEGRA' AND qt.nome='Integração Corporativa' AND qt.categoria='EAD' AND qc.codigo='EAD' AND qc.ativo=1 AND qc.deleted_at IS NULL AND qt.validade=24 AND qt.carga_horaria=2 AND qt.carga_horaria_inicial=2 AND qt.carga_horaria_recorrente=2 AND qt.ativo=1 AND qt.deleted_at IS NULL;"
assert_count integra-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='INTEGRA' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count integra-noncompany-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='INTEGRA' AND tr.ativo=1 AND tr.deleted_at IS NULL AND (tr.escopo<>'EMPRESA' OR tr.condicao_id IS NOT NULL);"
bash scripts/staging/validate-0534-postconditions.sh --target="$target"
echo TRAINING_COMPLIANCE_INTEGRA_BOOTSTRAP_0535_STAGING_POSTCONDITIONS=PASS
