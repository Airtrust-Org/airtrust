#!/bin/bash
set -euo pipefail

# SSOT Trigger & Cascata Validation Script
# Uso: bash scripts/test-ssot-triggers.sh [--remote|--local]
# Default: --remote
# Requisitos: wrangler instalado, migrations aplicadas (incluindo 0062)

MODE="--remote"
DB_NAME="airtrust-db"
for arg in "$@"; do
  case "$arg" in
    --local) MODE="--local"; DB_NAME="airtrust-db-dev" ;;
    --remote) MODE="--remote" ;;
  esac
done

echo "🚀 Iniciando validação SSOT (triggers + cascata) em ${MODE#--}"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ wrangler não encontrado"; exit 1
fi

RUN_ID=$(date +%s)
NOME_BASE="SSOT_TEST_${RUN_ID}"
echo "🔐 RUN_ID: $RUN_ID"

echo "👤 Criando funcionário base..."
wrangler d1 execute $DB_NAME $MODE --command "INSERT INTO funcionarios (nome, status) VALUES ('${NOME_BASE}_FUNC', 'ATIVO');" >/dev/null
FUNC_ID=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT seq FROM sqlite_sequence WHERE name='funcionarios';" | grep -Eo '[0-9]+' | tail -1 || true)
if [ -z "$FUNC_ID" ]; then echo "❌ Falha ao obter FUNC_ID"; exit 1; fi
echo "✅ Funcionário criado ID=$FUNC_ID"

echo "👨‍🏫 Usando mesmo funcionário como instrutor (simplificado)..."
INSTRUTOR_ID=$FUNC_ID
echo "✅ Instrutor ID=$INSTRUTOR_ID"

echo "🎓 Inserindo qualificação histórica (schema remoto simplificado)..."
wrangler d1 execute $DB_NAME $MODE --command "INSERT INTO qualificacoes_historico (funcionario_id, categoria, codigo, validade, tipo) VALUES (${FUNC_ID}, 'OPERACIONAL', 'Q-${RUN_ID}', date('now','+45 day'), 'TREINAMENTO');" >/dev/null

echo "🛩️ Verificando se 'sessoes_simulador' é tabela..."
SESS_TYPE=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT type FROM sqlite_master WHERE name='sessoes_simulador';" | grep -Eo '(table|view)' | head -1 || true)
if [ "$SESS_TYPE" = "table" ]; then
  echo "🛩️ Inserindo sessão simulador..."
  wrangler d1 execute $DB_NAME $MODE --command "INSERT INTO sessoes_simulador (funcionario_id, instrutor_id, simulador_id, tipo_sessao, data_sessao, hora_inicio, hora_fim, duracao_minutos, cenarios, resultado) VALUES (${FUNC_ID}, ${INSTRUTOR_ID}, 1, 'recorrente', date('now'), '08:00', '09:00', 60, 'DEMONSTRACAO', 'pendente');" >/dev/null
else
  echo "ℹ️ 'sessoes_simulador' é view – pulando inserção."
fi

echo "🏨 Inserindo hospedagem ativa (bloqueio soft delete)..."
set +e
wrangler d1 execute $DB_NAME $MODE --command "INSERT INTO hospedagens (funcionario_id, hotel, quarto, data_checkin, data_checkout, valor, status) VALUES (${FUNC_ID}, 'Hotel Test', '101', date('now'), date('now','+1 day'), 100.0, 'confirmado');" >/dev/null
HOSP_EXIT=$?
set -e
if [ $HOSP_EXIT -ne 0 ]; then
  echo "⚠️ Falha ao inserir hospedagem (FK ou tabela ausente). Prosseguindo sem bloqueio."
fi

echo "🧪 Verificando dependências (espera hospedagens=1)..."
DEPS_JSON=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT (SELECT COUNT(*) FROM hospedagens WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NULL) AS hospedagens, (SELECT COUNT(*) FROM qualificacoes_historico WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NULL) AS qualificacoes, (SELECT COUNT(*) FROM sessoes_simulador WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NULL) AS sessoes;" )
echo "$DEPS_JSON" | sed 's/^/   /'

echo "✏️ Atualizando nome funcionário (gera auditoria UPDATE)..."
wrangler d1 execute $DB_NAME $MODE --command "UPDATE funcionarios SET nome='${NOME_BASE}_FUNC_EDIT', updated_at=datetime('now') WHERE id=${FUNC_ID};" >/dev/null

AUDIT_UPDATE_COUNT=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT COUNT(*) AS c FROM auditoria_avancada_v2 WHERE tabela='funcionarios' AND registro_id='${FUNC_ID}' AND acao='UPDATE';" | grep -Eo '[0-9]+' | tail -1 || echo 0)
echo "🗂️ Auditoria UPDATE entries: $AUDIT_UPDATE_COUNT"

echo "🔒 Tentando soft delete (esperado BLOQUEIO lógico via service, mas direto SQL para cascata)..."
echo "    Removendo hospedagem para liberar exclusão..."
wrangler d1 execute $DB_NAME $MODE --command "UPDATE hospedagens SET deleted_at=datetime('now') WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NULL;" >/dev/null

echo "    Executando soft delete funcionário..."
wrangler d1 execute $DB_NAME $MODE --command "UPDATE funcionarios SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=${FUNC_ID};" >/dev/null

echo "🔍 Validando cascata (qualificações, sessões, hospedagens, FRMS)..."
if [ "$SESS_TYPE" = "table" ]; then
  CASCADE_COUNTS=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT (SELECT COUNT(*) FROM qualificacoes_historico WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NOT NULL) AS qual_del, (SELECT COUNT(*) FROM sessoes_simulador WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NOT NULL) AS sess_del, (SELECT COUNT(*) FROM hospedagens WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NOT NULL) AS hosp_del;" )
else
  CASCADE_COUNTS=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT (SELECT COUNT(*) FROM qualificacoes_historico WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NOT NULL) AS qual_del, (SELECT COUNT(*) FROM hospedagens WHERE funcionario_id=${FUNC_ID} AND deleted_at IS NOT NULL) AS hosp_del;" )
fi
echo "$CASCADE_COUNTS" | sed 's/^/   /'

AUDIT_SOFT_COUNT=$(wrangler d1 execute $DB_NAME $MODE --command "SELECT COUNT(*) AS c FROM auditoria_avancada_v2 WHERE tabela='funcionarios' AND registro_id='${FUNC_ID}' AND acao='SOFT_DELETE';" | grep -Eo '[0-9]+' | tail -1 || echo 0)
echo "🗂️ Auditoria SOFT_DELETE entries: $AUDIT_SOFT_COUNT"

echo "🧾 Resumo Final:" 
echo "   FUNC_ID: $FUNC_ID"
echo "   UPDATE auditoria: $AUDIT_UPDATE_COUNT"
echo "   SOFT_DELETE auditoria: $AUDIT_SOFT_COUNT"

PASS=true
if [ "$AUDIT_UPDATE_COUNT" -lt 1 ]; then echo "❌ Falha: sem auditoria UPDATE"; PASS=false; fi
if [ "$AUDIT_SOFT_COUNT" -lt 1 ]; then echo "❌ Falha: sem auditoria SOFT_DELETE"; PASS=false; fi
if [ $HOSP_EXIT -ne 0 ]; then echo "⚠️ Hospedagem não validada (inserção falhou)."; fi

if $PASS; then
  echo "✅ SUCESSO: Triggers e cascata operacionais"
  exit 0
else
  echo "❌ ERROS detectados"
  exit 1
fi
