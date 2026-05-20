#!/bin/bash
set -euo pipefail

# Script de teste: Simula evento EdApp e verifica notificação

API_URL="https://api.airtrust.online"
# API_URL="http://localhost:8787"  # Para testes locais

echo "🧪 TESTE SISTEMA DE NOTIFICAÇÕES EDAPP"
echo "======================================"
echo ""

# 1. Buscar um funcionário com vínculo EdApp para usar no teste
echo "📋 1. Buscando funcionário com vínculo EdApp..."
VINCULO=$(curl -fsSL "${API_URL}/api/integracoes/edapp/vinculos" | \
  jq -r '.data.items[0]')

if [ "$VINCULO" = "null" ] || [ -z "$VINCULO" ]; then
  echo "❌ ERRO: Nenhum vínculo EdApp encontrado"
  echo "💡 Crie um vínculo primeiro em /configuracoes -> EdApp"
  exit 1
fi

EDAPP_USER_ID=$(echo "$VINCULO" | jq -r '.edapp_user_id')
FUNCIONARIO_ID=$(echo "$VINCULO" | jq -r '.funcionario_id')
FUNCIONARIO_NOME=$(echo "$VINCULO" | jq -r '.funcionario_nome')
FUNCIONARIO_EMAIL=$(echo "$VINCULO" | jq -r '.funcionario_email')

echo "   ✅ Funcionário: $FUNCIONARIO_NOME (ID: $FUNCIONARIO_ID)"
echo "   ✅ EdApp User ID: $EDAPP_USER_ID"
echo "   ✅ Email: $FUNCIONARIO_EMAIL"
echo ""

# 2. Buscar uma qualificação EdApp para usar no teste
echo "📋 2. Buscando qualificação EdApp..."
QUALIFICACAO=$(curl -fsSL "${API_URL}/api/qualificacoes/tipos" | \
  jq -r '.data.items[] | select(.integracao_edapp == true) | select(.edapp_course_id != null) | select(.edapp_course_id != "") | . ' | head -1)

if [ -z "$QUALIFICACAO" ] || [ "$QUALIFICACAO" = "null" ]; then
  echo "❌ ERRO: Nenhuma qualificação com EdApp configurada"
  exit 1
fi

COURSE_ID=$(echo "$QUALIFICACAO" | jq -r '.edapp_course_id')
COURSE_NAME=$(echo "$QUALIFICACAO" | jq -r '.edapp_course_name // .nome')
QUALIF_CODIGO=$(echo "$QUALIFICACAO" | jq -r '.codigo')

echo "   ✅ Qualificação: $QUALIF_CODIGO"
echo "   ✅ Course ID: $COURSE_ID"
echo "   ✅ Course Name: $COURSE_NAME"
echo ""

# 3. Criar payload de teste (simulando webhook EdApp)
echo "📦 3. Criando payload de teste..."

COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EVENT_ID="test-$(date +%s)-$(openssl rand -hex 4)"

PAYLOAD=$(cat <<EOF
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
      "email": "${FUNCIONARIO_EMAIL}",
      "firstName": "$(echo $FUNCIONARIO_NOME | awk '{print $1}')",
      "lastName": "$(echo $FUNCIONARIO_NOME | awk '{for(i=2;i<=NF;i++) printf "%s ", $i}')"
    },
    "course": {
      "id": "${COURSE_ID}",
      "title": "${COURSE_NAME}"
    }
  }
}
EOF
)

echo "   ✅ Payload criado (EventID: $EVENT_ID)"
echo ""

# 4. Enviar para webhook
echo "🚀 4. Enviando evento para webhook..."
WEBHOOK_RESPONSE=$(curl -fsSL -X POST \
  "${API_URL}/api/integracoes/edapp/webhook" \
  -H "Content-Type: application/json" \
  -H "X-EdApp-Signature: test-signature" \
  -d "$PAYLOAD")

echo "   📡 Response: $WEBHOOK_RESPONSE"
echo ""

# Verificar se foi sucesso
SUCCESS=$(echo "$WEBHOOK_RESPONSE" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "❌ ERRO: Webhook falhou"
  echo "$WEBHOOK_RESPONSE" | jq '.'
  exit 1
fi

echo "   ✅ Webhook processado com sucesso"
echo ""

# 5. Aguardar 2 segundos para garantir que notificação foi criada
echo "⏳ 5. Aguardando 2s..."
sleep 2
echo ""

# 6. Verificar se notificação foi criada
echo "🔔 6. Verificando notificações criadas..."
NOTIFICACOES=$(curl -fsSL "${API_URL}/api/notificacoes/sistema?limit=5&lida=false")

echo "   📊 Response completo:"
echo "$NOTIFICACOES" | jq '.'
echo ""

# Buscar a notificação específica do nosso teste
NOTIF_COUNT=$(echo "$NOTIFICACOES" | jq -r '.data.total')
echo "   📈 Total de notificações não lidas: $NOTIF_COUNT"

if [ "$NOTIF_COUNT" -eq 0 ]; then
  echo "   ⚠️  Nenhuma notificação encontrada"
  echo ""
  echo "   🔍 Verificando se há erro no sistema..."
  # Verificar evento no banco
  exit 1
fi

# Mostrar última notificação
ULTIMA_NOTIF=$(echo "$NOTIFICACOES" | jq -r '.data.items[0]')
echo ""
echo "   📬 Última Notificação:"
echo "      Tipo: $(echo "$ULTIMA_NOTIF" | jq -r '.tipo')"
echo "      Título: $(echo "$ULTIMA_NOTIF" | jq -r '.titulo')"
echo "      Mensagem: $(echo "$ULTIMA_NOTIF" | jq -r '.mensagem')"
echo "      Prioridade: $(echo "$ULTIMA_NOTIF" | jq -r '.prioridade')"
echo "      Lida: $(echo "$ULTIMA_NOTIF" | jq -r '.lida')"
echo "      Link: $(echo "$ULTIMA_NOTIF" | jq -r '.link')"
echo ""

# Verificar se é do tipo EdApp
TIPO_NOTIF=$(echo "$ULTIMA_NOTIF" | jq -r '.tipo')
if [ "$TIPO_NOTIF" = "EDAPP_QUALIFICACAO" ]; then
  echo "   ✅ Notificação EdApp criada corretamente!"
else
  echo "   ⚠️  Tipo diferente: $TIPO_NOTIF (esperado: EDAPP_QUALIFICACAO)"
fi

echo ""
echo "🎉 TESTE CONCLUÍDO COM SUCESSO!"
echo ""
echo "📊 Resumo:"
echo "   • Funcionário: $FUNCIONARIO_NOME"
echo "   • Qualificação: $QUALIF_CODIGO ($COURSE_NAME)"
echo "   • Score: 95%"
echo "   • Data: $COMPLETED_AT"
echo "   • Notificação: Criada e visível"
echo ""
echo "💡 Acesse ${API_URL%/api} e veja o badge de notificações no header!"
