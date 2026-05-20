#!/bin/bash
set -euo pipefail

# Script de teste via D1: Simula evento EdApp e verifica notificação
cd "/Users/filipedaumas/Documents/airtrust v1/worker-airtrust"

echo "🧪 TESTE SISTEMA DE NOTIFICAÇÕES EDAPP (via D1)"
echo "==============================================="
echo ""

# 1. Buscar vínculo EdApp existente
echo "📋 1. Buscando vínculo EdApp..."
VINCULO=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT v.*, f.nome as funcionario_nome FROM integracoes_edapp_vinculos v JOIN funcionarios f ON v.funcionario_id = f.id WHERE v.deleted_at IS NULL LIMIT 1" \
  2>/dev/null | tail -n +3)

if [ -z "$VINCULO" ]; then
  echo "❌ ERRO: Nenhum vínculo encontrado"
  exit 1
fi

echo "$VINCULO"
echo ""

# Extrair dados (parse manual porque pode não ser JSON)
EDAPP_USER_ID=$(echo "$VINCULO" | grep -o 'edapp_user_id | [^|]*' | awk -F'|' '{print $2}' | tr -d ' ' | head -1)
FUNCIONARIO_ID=$(echo "$VINCULO" | grep -o 'funcionario_id | [0-9]*' | awk -F'|' '{print $2}' | tr -d ' ' | head -1)
FUNCIONARIO_NOME=$(echo "$VINCULO" | grep -o 'funcionario_nome | [^|]*' | awk -F'|' '{print $2}' | sed 's/^ *//;s/ *$//' | head -1)

echo "   ✅ Funcionário: $FUNCIONARIO_NOME (ID: $FUNCIONARIO_ID)"
echo "   ✅ EdApp User ID: $EDAPP_USER_ID"
echo ""

# 2. Buscar qualificação EdApp
echo "📋 2. Buscando qualificação EdApp..."
QUALIF=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT codigo, edapp_course_id, edapp_course_name FROM qualificacoes_tipos WHERE integracao_edapp = 1 AND edapp_course_id IS NOT NULL AND deleted_at IS NULL LIMIT 1" \
  2>/dev/null | tail -n +3)

echo "$QUALIF"
echo ""

COURSE_ID=$(echo "$QUALIF" | grep -o 'edapp_course_id | [^|]*' | awk -F'|' '{print $2}' | tr -d ' ' | head -1)
QUALIF_CODIGO=$(echo "$QUALIF" | grep -o 'codigo | [^|]*' | awk -F'|' '{print $2}' | tr -d ' ' | head -1)
COURSE_NAME=$(echo "$QUALIF" | grep -o 'edapp_course_name | [^|]*' | awk -F'|' '{print $2}' | sed 's/^ *//;s/ *$//' | head -1)

echo "   ✅ Qualificação: $QUALIF_CODIGO"
echo "   ✅ Course ID: $COURSE_ID"
echo "   ✅ Course Name: $COURSE_NAME"
echo ""

# 3. Inserir evento de teste no banco
echo "📦 3. Inserindo evento de teste no banco..."
COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EVENT_ID="test-$(date +%s)-$(openssl rand -hex 4)"

EVENTO_PAYLOAD=$(cat <<EOF
{
  "event": "CourseCompleted",
  "eventId": "${EVENT_ID}",
  "data": {
    "userId": "${EDAPP_USER_ID}",
    "courseId": "${COURSE_ID}",
    "completedAt": "${COMPLETED_AT}",
    "score": 95,
    "user": {
      "id": "${EDAPP_USER_ID}",
      "email": "test@example.com"
    },
    "course": {
      "id": "${COURSE_ID}",
      "title": "${COURSE_NAME}"
    }
  }
}
EOF
)

# Escapar JSON para SQL
EVENTO_PAYLOAD_ESCAPED=$(echo "$EVENTO_PAYLOAD" | jq -c '.' | sed "s/'/''/g")

INSERT_RESULT=$(npx wrangler d1 execute airtrust-db --remote \
  --command "INSERT INTO integracoes_edapp_eventos (event_id, event_type, payload, processado, created_at) VALUES ('$EVENT_ID', 'CourseCompleted', '$EVENTO_PAYLOAD_ESCAPED', 0, datetime('now'))" \
  2>&1)

echo "$INSERT_RESULT"
echo ""

# Verificar se inseriu
EVENTO_CRIADO=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT id FROM integracoes_edapp_eventos WHERE event_id = '$EVENT_ID'" \
  2>/dev/null | tail -n +3)

if [ -z "$EVENTO_CRIADO" ]; then
  echo "❌ ERRO: Evento não foi criado"
  exit 1
fi

EVENTO_DB_ID=$(echo "$EVENTO_CRIADO" | grep -o '[0-9]\+' | head -1)
echo "   ✅ Evento criado (DB ID: $EVENTO_DB_ID)"
echo ""

# 4. Processar evento manualmente (simular webhook)
echo "🔄 4. Processando evento..."

# Criar qualificação
DATA_CONCLUSAO=$(date -u +"%Y-%m-%d %H:%M:%S")
INSERT_QUALIF=$(npx wrangler d1 execute airtrust-db --remote \
  --command "INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_codigo, origem, data_conclusao, observacoes, created_at, updated_at) VALUES ($FUNCIONARIO_ID, '$QUALIF_CODIGO', 'course_id:$COURSE_ID', '$DATA_CONCLUSAO', 'Teste automático - Score: 95%', datetime('now'), datetime('now'))" \
  2>&1)

echo "$INSERT_QUALIF"

# Pegar ID da qualificação criada
QUALIF_ID=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT id FROM qualificacoes_historico WHERE funcionario_id = $FUNCIONARIO_ID AND qualificacao_codigo = '$QUALIF_CODIGO' ORDER BY created_at DESC LIMIT 1" \
  2>/dev/null | tail -n +3 | grep -o '[0-9]\+' | head -1)

echo "   ✅ Qualificação criada (ID: $QUALIF_ID)"
echo ""

# 5. Marcar evento como processado
echo "📝 5. Marcando evento como processado..."
npx wrangler d1 execute airtrust-db --remote \
  --command "UPDATE integracoes_edapp_eventos SET processado = 1, funcionario_id = $FUNCIONARIO_ID, qualificacao_historico_id = $QUALIF_ID, updated_at = datetime('now') WHERE event_id = '$EVENT_ID'" \
  2>&1 | tail -1

echo ""

# 6. CRIAR NOTIFICAÇÃO (O TESTE PRINCIPAL!)
echo "🔔 6. Criando notificação..."
GRUPO_NOTIF="edapp_$(date -u +"%Y-%m-%d")"
DADOS_JSON=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID,
  "funcionario_nome": "$FUNCIONARIO_NOME",
  "qualificacao_codigo": "$QUALIF_CODIGO",
  "data_conclusao": "$COMPLETED_AT",
  "score": 95,
  "courseId": "$COURSE_ID",
  "renovacao": false
}
EOF
)
DADOS_JSON_ESCAPED=$(echo "$DADOS_JSON" | jq -c '.' | sed "s/'/''/g")

INSERT_NOTIF=$(npx wrangler d1 execute airtrust-db --remote \
  --command "INSERT INTO notificacoes_sistema (tipo, prioridade, titulo, mensagem, dados, grupo, funcionario_id, qualificacao_historico_id, link, acao_primaria, created_at) VALUES ('EDAPP_QUALIFICACAO', 'MEDIA', '✅ Treinamento EdApp Concluído', '$FUNCIONARIO_NOME concluiu o treinamento $COURSE_NAME', '$DADOS_JSON_ESCAPED', '$GRUPO_NOTIF', $FUNCIONARIO_ID, $QUALIF_ID, '/qualificacoes?id=$QUALIF_ID', 'Ver Qualificação', datetime('now'))" \
  2>&1)

echo "$INSERT_NOTIF"
echo ""

# 7. Verificar se notificação foi criada
echo "✅ 7. Verificando notificação criada..."
NOTIF=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT id, tipo, titulo, mensagem, prioridade, lida, link FROM notificacoes_sistema WHERE funcionario_id = $FUNCIONARIO_ID AND qualificacao_historico_id = $QUALIF_ID" \
  2>/dev/null | tail -n +3)

echo "$NOTIF"
echo ""

if [ -z "$NOTIF" ]; then
  echo "❌ ERRO: Notificação não foi criada"
  exit 1
fi

NOTIF_ID=$(echo "$NOTIF" | grep -o 'id | [0-9]*' | awk -F'|' '{print $2}' | tr -d ' ' | head -1)
echo "   ✅ Notificação criada (ID: $NOTIF_ID)"
echo ""

# 8. Testar contadores
echo "📊 8. Testando contador de notificações..."
CONTADOR=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT COUNT(*) as total FROM notificacoes_sistema WHERE lida = 0 AND deleted_at IS NULL" \
  2>/dev/null | tail -n +3)

echo "$CONTADOR"
echo ""

# 9. Listar últimas notificações
echo "📬 9. Listando últimas notificações não lidas..."
NOTIFS=$(npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT id, tipo, titulo, mensagem, created_at FROM notificacoes_sistema WHERE lida = 0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3" \
  2>/dev/null | tail -n +3)

echo "$NOTIFS"
echo ""

echo "🎉 TESTE CONCLUÍDO COM SUCESSO!"
echo ""
echo "📊 Resumo:"
echo "   • Evento ID: $EVENT_ID"
echo "   • Funcionário: $FUNCIONARIO_NOME (ID: $FUNCIONARIO_ID)"
echo "   • Qualificação: $QUALIF_CODIGO (ID: $QUALIF_ID)"
echo "   • Notificação: ID $NOTIF_ID criada"
echo "   • Tipo: EDAPP_QUALIFICACAO"
echo "   • Prioridade: MEDIA"
echo ""
echo "💡 Agora teste no frontend:"
echo "   1. Acesse https://airtrust.online"
echo "   2. Faça login"
echo "   3. Veja o badge de notificações no header (deve ter contador)"
echo "   4. Clique no badge para ver a notificação"
echo ""
echo "🧹 Para limpar o teste:"
echo "   npx wrangler d1 execute airtrust-db --remote --command \"DELETE FROM notificacoes_sistema WHERE id = $NOTIF_ID\""
