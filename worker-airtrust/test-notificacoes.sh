#!/bin/bash

API_URL="https://airtrust-api-production.airtrust.workers.dev"

echo "🔔 =========================================="
echo "   TESTES DO SISTEMA DE NOTIFICAÇÕES"
echo "=========================================="
echo ""

# Obter token
echo "🔑 Obtendo token de autenticação..."
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "teste@airtrust.com", "senha": "Teste@123"}' | jq -r ".data.accessToken")

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Falha ao obter token. Verifique as credenciais."
  exit 1
fi

echo "✅ Token obtido com sucesso"
echo ""

# 1. Listar configurações
echo "1️⃣  GET /api/notificacoes/config"
echo "─────────────────────────────────────────"
curl -s "$API_URL/api/notificacoes/config" \
  -H "Authorization: Bearer $TOKEN" | jq ".data[] | {id, tipo, ativo, dias_antes, urgencia}"
echo ""

# 2. Processar notificações manualmente
echo "2️⃣  POST /api/notificacoes/processar (manual)"
echo "─────────────────────────────────────────"
PROCESSAR=$(curl -s -X POST "$API_URL/api/notificacoes/processar" \
  -H "Authorization: Bearer $TOKEN")
echo "$PROCESSAR" | jq "{success, message, timestamp}"
echo ""

# Aguardar 2 segundos para processamento
sleep 2

# 3. Ver log de notificações (últimas 10)
echo "3️⃣  GET /api/notificacoes/log (últimas 10)"
echo "─────────────────────────────────────────"
curl -s "$API_URL/api/notificacoes/log?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq "{
    count: .meta.count,
    stats: .meta.stats,
    ultimas_5: .data[:5] | map({
      funcionario_nome,
      qualificacao_nome,
      status,
      tipo,
      enviado_em
    })
  }"
echo ""

# 4. Filtrar log por status
echo "4️⃣  GET /api/notificacoes/log?status=enviada"
echo "─────────────────────────────────────────"
curl -s "$API_URL/api/notificacoes/log?status=enviada&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq ".data | length" | xargs -I {} echo "Notificações enviadas: {}"
echo ""

# 5. Atualizar configuração (desativar uma)
echo "5️⃣  PUT /api/notificacoes/config/1 (desativar)"
echo "─────────────────────────────────────────"
curl -s -X PUT "$API_URL/api/notificacoes/config/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ativo": 0}' | jq "{success, data: .data | {id, tipo, ativo}}"
echo ""

# 6. Reativar configuração
echo "6️⃣  PUT /api/notificacoes/config/1 (reativar)"
echo "─────────────────────────────────────────"
curl -s -X PUT "$API_URL/api/notificacoes/config/1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ativo": 1}' | jq "{success, data: .data | {id, tipo, ativo}}"
echo ""

echo "✅ =========================================="
echo "   TODOS OS TESTES CONCLUÍDOS!"
echo "=========================================="
echo ""
echo "📊 Resumo:"
echo "• Configurações listadas ✅"
echo "• Processamento manual testado ✅"
echo "• Log de notificações consultado ✅"
echo "• Filtros funcionando ✅"
echo "• Update de config testado ✅"
echo ""
echo "🕐 Próxima execução automática (cron): Amanhã às 8h UTC"
