#!/bin/bash

# Configurações
API_URL="https://airtrust-api-production.airtrust.workers.dev"
TOKEN="${AIRTRUST_TOKEN:-SEU_TOKEN_AQUI}"

echo "🧪 Testando Endpoints FASE 3 - Histórico de Qualificações"
echo "==========================================================="
echo ""

# 1. Criar histórico
echo "📝 1. POST /api/qualificacoes/historico"
echo "   Criando novo registro de qualificação..."
curl -s -X POST "$API_URL/api/qualificacoes/historico" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_cpf": "01234567890",
    "qualificacao_codigo": "CMA",
    "data_conclusao": "2024-11-27",
    "nota": 5.0,
    "instrutor": "Dr. Silva",
    "local": "São Paulo",
    "modalidade": "PRESENCIAL"
  }' | jq '.'
echo ""

# 2. Listar histórico
echo "📋 2. GET /api/qualificacoes/historico"
echo "   Listando últimos 5 registros..."
curl -s "$API_URL/api/qualificacoes/historico?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 3. Buscar alertas
echo "⚠️  3. GET /api/qualificacoes/alertas"
echo "   Buscando alertas de urgência high..."
curl -s "$API_URL/api/qualificacoes/alertas?urgencia=high" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 4. Resumo de alertas
echo "📊 4. GET /api/qualificacoes/alertas/resumo"
echo "   Obtendo estatísticas gerais..."
curl -s "$API_URL/api/qualificacoes/alertas/resumo" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 5. Filtrar por funcionário
echo "👤 5. GET /api/qualificacoes/historico?funcionario_cpf=01234567890"
echo "   Filtrando por CPF de funcionário..."
curl -s "$API_URL/api/qualificacoes/historico?funcionario_cpf=01234567890" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 6. Filtrar por status
echo "🔍 6. GET /api/qualificacoes/historico?status=expirando"
echo "   Filtrando por status 'expirando'..."
curl -s "$API_URL/api/qualificacoes/historico?status=expirando" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

echo "✅ Testes completos!"
echo ""
echo "Notas:"
echo "- Para autenticar, defina AIRTRUST_TOKEN no ambiente"
echo "- Ou edite TOKEN na linha 4 deste script"
echo "- Alguns testes podem retornar vazio se não houver dados"
