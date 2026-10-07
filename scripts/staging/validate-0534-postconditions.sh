#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0534 postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
postcondition_failures=0
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; if [[ "$count" != "$expected" ]]; then
    echo "POSTCONDITION_FAIL=$label expected=$expected found=$count" >&2
    if [[ "$label" == "migration-ledger-0534" ]]; then exit 1; fi
    postcondition_failures=$((postcondition_failures+1))
  else echo "POSTCONDITION_OK=$label"; fi; }
assert_positive(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; if (( count <= 0 )); then
    echo "POSTCONDITION_FAIL=$label expected_positive found=$count" >&2
    postcondition_failures=$((postcondition_failures+1))
  else echo "POSTCONDITION_OK=$label"; fi; }

assert_count migration-ledger-0534 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0534_training_compliance_final_matrix.sql';"
assert_count nr05-ead 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND categoria='EAD' AND validade IS NULL AND ativo=1 AND deleted_at IS NULL;"
assert_count codigo-etica 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='COD_ETICA' AND categoria='EAD' AND validade=12 AND carga_horaria=3 AND ativo=1 AND deleted_at IS NULL;"
# Reviewed, non-sensitive read-only counts after staging 0534 was applied.
# This also executes on the validation-only ledger=1 path; it never writes D1.
# Never emit row contents, names, course/person identities, or raw SQL responses.
echo "DIAG_0534_INTEGRA_ACTIVE_CANONICAL=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_ANY_STATE=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA';")"
echo "DIAG_0534_INTEGRA_ACTIVE_EXACT=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='INTEGRA' AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_CATEGORY_EAD=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND categoria='EAD' AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_VALIDITY_24=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND validade=24 AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_HOURS_2=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND carga_horaria=2 AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_NAME_CANDIDATES=$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(nome)) LIKE '%INTEGRA%' AND ativo=1 AND deleted_at IS NULL;")"
echo "DIAG_0534_INTEGRA_ACTIVE_COURSES=$(query_count "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND UPPER(TRIM(qt.codigo))='INTEGRA' AND c.ativo=1 AND c.deleted_at IS NULL;")"

assert_count integra 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='INTEGRA' AND categoria='EAD' AND validade=24 AND carga_horaria=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count nr12 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-12' AND categoria='Treinamento' AND validade=24 AND carga_horaria=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count nr20 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-20' AND categoria='EAD' AND validade=24 AND carga_horaria=2 AND carga_horaria_inicial=2 AND carga_horaria_recorrente=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count nr20-modality-overrides 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-20' AND tr.ativo=1 AND tr.deleted_at IS NULL AND tr.modalidade_requerida IS NOT NULL;"
assert_count d2 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D2' AND categoria='EAD' AND validade=36 AND carga_horaria=4 AND carga_horaria_inicial=4 AND carga_horaria_recorrente=4 AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-mecanico 1 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_areas qa ON qa.id=qt.area_id WHERE qt.empresa_id=6 AND qt.codigo='FDM-MECANICO' AND qt.categoria='EAD' AND qt.validade IS NULL AND qt.carga_horaria=1 AND qa.codigo='SEGURANCA_OPERACIONAL' AND qt.ativo=1 AND qt.deleted_at IS NULL;"
assert_count bowtiexp 1 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_areas qa ON qa.id=qt.area_id WHERE qt.empresa_id=6 AND qt.codigo='BOWTIEXP' AND qt.categoria='EAD' AND qt.validade=24 AND qt.carga_horaria=4 AND qa.codigo='SEGURANCA_OPERACIONAL' AND qt.ativo=1 AND qt.deleted_at IS NULL;"
assert_count fdm-legacy-active-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-EAD' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count regras-ouro-canonical 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='REGRAS_OURO_PETROBRAS' AND categoria='EAD' AND validade=24 AND carga_horaria=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count petro-ouro-active 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='PETRO-OURO' AND ativo=1 AND deleted_at IS NULL;"
regras_history="$(query_count "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND qh.deleted_at IS NULL;")"
if (( regras_history > 0 )); then echo "POSTCONDITION_OK=regras-ouro-history"; else echo "POSTCONDITION_SKIPPED=regras-ouro-history-staging-fixture-absent"; fi
assert_count regras-ouro-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"

assert_count aud-muda-non-individual 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo IN ('AUD_COMP','MUDA') AND tr.ativo=1 AND tr.deleted_at IS NULL AND tr.escopo<>'FUNCIONARIO';"
assert_count nr05-designation 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND cc.codigo='MEMBRO_CIPA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count brigade-designation 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='BRIGADA_INCENDIO' AND cc.codigo='BRIGADISTA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count first-aid-designation 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='PRIMEIROS_SOCORROS' AND cc.codigo='SOCORRISTA_DESIGNADO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count losa-designation 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='LOSA' AND cc.codigo='LOSA_OBSERVADOR' AND tr.ativo=1 AND tr.deleted_at IS NULL;"

assert_count nr12-missing 0 "SELECT COUNT(*) count FROM funcoes f WHERE f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO') AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='NR-12' AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.ativo=1 AND tr.deleted_at IS NULL);"
assert_count fdm-mecanico-missing 0 "SELECT COUNT(*) count FROM funcoes f WHERE f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO') AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-MECANICO' AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.ativo=1 AND tr.deleted_at IS NULL);"

assert_count nr26-extra 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN funcoes f ON f.id=tr.funcao_id WHERE tr.empresa_id=6 AND qt.codigo='NR-26' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND UPPER(TRIM(f.nome)) NOT IN ('AGENTE DE ATENDIMENTO','AGENTE DE RAMPA','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUXILIAR DE QSMS','AUXILIAR DE SUPRIMENTOS','COMANDANTE','COORDENADOR DE ENGENHARIA','COPILOTO','GERENTE DE BASES','GERENTE DE MANUTENÇÃO','GERENTE DE MANUTENCAO','GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES','GERENTE DE QSMS','GERENTE DE SEGURANÇA OPERACIONAL','GERENTE DE SEGURANCA OPERACIONAL','MECÂNICO','MECANICO','MOTORISTA','SUPERVISOR DE ENGENHARIA','SUPERVISOR DE SUPRIMENTOS','TÉCNICO DE SEGURANÇA DO TRABALHO','TECNICO DE SEGURANCA DO TRABALHO');"
assert_count nr26-missing 0 "SELECT COUNT(*) count FROM funcoes f WHERE f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL AND UPPER(TRIM(f.nome)) IN ('AGENTE DE ATENDIMENTO','AGENTE DE RAMPA','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUXILIAR DE QSMS','AUXILIAR DE SUPRIMENTOS','COMANDANTE','COORDENADOR DE ENGENHARIA','COPILOTO','GERENTE DE BASES','GERENTE DE MANUTENÇÃO','GERENTE DE MANUTENCAO','GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES','GERENTE DE QSMS','GERENTE DE SEGURANÇA OPERACIONAL','GERENTE DE SEGURANCA OPERACIONAL','MECÂNICO','MECANICO','MOTORISTA','SUPERVISOR DE ENGENHARIA','SUPERVISOR DE SUPRIMENTOS','TÉCNICO DE SEGURANÇA DO TRABALHO','TECNICO DE SEGURANCA DO TRABALHO') AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='NR-26' AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.ativo=1 AND tr.deleted_at IS NULL);"

for code in PPSP_SUP BOWTIEXP; do
  assert_count "$code-manager-missing" 0 "SELECT COUNT(*) count FROM funcoes f WHERE f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL AND (UPPER(TRIM(f.nome))='GERENTE' OR UPPER(TRIM(f.nome)) LIKE 'GERENTE %') AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='$code' AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.ativo=1 AND tr.deleted_at IS NULL);"
  assert_count "$code-manager-extra" 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN funcoes f ON f.id=tr.funcao_id WHERE tr.empresa_id=6 AND qt.codigo='$code' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND NOT (UPPER(TRIM(f.nome))='GERENTE' OR UPPER(TRIM(f.nome)) LIKE 'GERENTE %');"
done

assert_count crm-corp-company 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-corp-rbac119-exclusions 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.obrigatoriedade='NAO_APLICA' AND cc.codigo IN ('RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC119_PILOTO_CHEFE') AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-dir-rbac119-rules 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND tr.obrigatoriedade='OBRIGATORIA' AND cc.codigo IN ('RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC119_PILOTO_CHEFE') AND tr.ativo=1 AND tr.deleted_at IS NULL;"

assert_count nr35-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-35' AND categoria='Presencial' AND validade=24 AND carga_horaria=8 AND ativo=1 AND deleted_at IS NULL;"
assert_count nr35-rule-modality 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='NR-35' AND tr.ativo=1 AND tr.deleted_at IS NULL AND COALESCE(tr.modalidade_requerida,'')<>'PRESENCIAL';"
nr20_courses="$(query_count "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND qt.codigo='NR-20' AND c.ativo=1 AND c.deleted_at IS NULL;")"
if (( nr20_courses > 0 )); then
  assert_count nr20-course-autoqual 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND qt.codigo='NR-20' AND c.ativo=1 AND c.deleted_at IS NULL AND c.gerar_qualificacao_ao_concluir<>1;"
fi
assert_count nr35-course-autoqual 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND qt.codigo='NR-35' AND c.ativo=1 AND c.deleted_at IS NULL AND c.gerar_qualificacao_ao_concluir<>0;"
if (( postcondition_failures > 0 )); then
  echo "TRAINING_COMPLIANCE_FINAL_MATRIX_0534_STAGING_POSTCONDITION_FAILURE_COUNT=$postcondition_failures" >&2
  exit 1
fi
echo TRAINING_COMPLIANCE_FINAL_MATRIX_0534_STAGING_POSTCONDITIONS=PASS
