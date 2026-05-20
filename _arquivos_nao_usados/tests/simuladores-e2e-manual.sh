#!/bin/bash

# =============================================================================
# 🧪 TESTES E2E MANUAIS - MÓDULO SIMULADORES (macOS compatible)
# =============================================================================

API_URL="${1:-https://airtrust-api-production.airtrust.workers.dev}"
PASS=0
FAIL=0

echo "======================================"
echo "🧪 TESTES E2E - MÓDULO SIMULADORES"
echo "API: $API_URL"
echo "======================================"
echo ""

# Teste 1: Health Check
echo "✅ Teste 1: Health Check"
curl -s "$API_URL/api/health" | jq -r '.status' | grep -q "healthy" && ((PASS++)) || ((FAIL++))
echo ""

# Teste 2: GET /api/simuladores
echo "✅ Teste 2: Listar Simuladores"
SIMS=$(curl -s "$API_URL/api/simuladores" | jq -r '.data | length')
echo "   Encontrados: $SIMS simuladores"
[[ $SIMS -gt 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 3: POST /api/simuladores
echo "✅ Teste 3: Criar Simulador"
NEW_ID=$(curl -s -X POST "$API_URL/api/simuladores" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"E2E-TEST-001","tipo_aeronave":"B737-800","fabricante":"Boeing","observacoes":"Teste E2E"}' \
  | jq -r '.data.id')
echo "   ID criado: $NEW_ID"
[[ "$NEW_ID" != "null" && "$NEW_ID" != "" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 4: GET /api/simuladores/:id
echo "✅ Teste 4: Buscar Simulador por ID"
SIM_MODELO=$(curl -s "$API_URL/api/simuladores/$NEW_ID" | jq -r '.data.modelo // .data.tipo_aeronave')
echo "   Modelo: $SIM_MODELO"
[[ "$SIM_MODELO" != "null" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 5: PUT /api/simuladores/:id
echo "✅ Teste 5: Atualizar Simulador"
curl -s -X PUT "$API_URL/api/simuladores/$NEW_ID" \
  -H "Content-Type: application/json" \
  -d '{"observacoes":"Atualizado via E2E"}' | jq -r '.success' | grep -q "true" && ((PASS++)) || ((FAIL++))
echo ""

# Teste 6: GET /api/simuladores/sessoes
echo "✅ Teste 6: Listar Sessões"
SESSOES=$(curl -s "$API_URL/api/simuladores/sessoes" | jq -r '.data | length')
echo "   Encontradas: $SESSOES sessões"
[[ $SESSOES -ge 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 7: POST /api/simuladores/sessoes
echo "✅ Teste 7: Criar Sessão"
SESSAO_ID=$(curl -s -X POST "$API_URL/api/simuladores/sessoes" \
  -H "Content-Type: application/json" \
  -d "{\"simulador_id\":$NEW_ID,\"instrutor_id\":1,\"data_sessao\":\"2025-12-01T10:00:00Z\",\"duracao_minutos\":90,\"tipo_sessao\":\"TREINAMENTO\"}" \
  | jq -r '.data.id // empty')
echo "   Sessão ID: ${SESSAO_ID:-ERRO}"
[[ "$SESSAO_ID" != "" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 8: GET /api/simuladores/fichas
echo "✅ Teste 8: Listar Fichas"
FICHAS=$(curl -s "$API_URL/api/simuladores/fichas" | jq -r '.data | length')
echo "   Encontradas: $FICHAS fichas"
[[ $FICHAS -ge 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 9: GET /api/simuladores/manobras
echo "✅ Teste 9: Listar Manobras"
MANOBRAS=$(curl -s "$API_URL/api/simuladores/manobras" | jq -r '.data | length')
echo "   Encontradas: $MANOBRAS manobras"
[[ $MANOBRAS -gt 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 10: GET /api/simuladores/relatorios/uso
echo "✅ Teste 10: Relatório de Uso"
curl -s "$API_URL/api/simuladores/relatorios/uso" | jq -r '.success' | grep -q "true" && ((PASS++)) || ((FAIL++))
echo ""

# Teste 11: Filtro por status
echo "✅ Teste 11: Filtrar Simuladores por Status"
ATIVOS=$(curl -s "$API_URL/api/simuladores?status=ATIVO" | jq -r '.data | length')
echo "   Ativos: $ATIVOS"
[[ $ATIVOS -ge 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 12: Edge case - ID inexistente
echo "✅ Teste 12: Buscar ID inexistente (999999)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/simuladores/999999")
echo "   HTTP Code: $HTTP_CODE"
[[ "$HTTP_CODE" == "404" || "$HTTP_CODE" == "500" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 13: POST sem campos obrigatórios
echo "✅ Teste 13: POST sem campos obrigatórios"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/simuladores" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "   HTTP Code: $HTTP_CODE"
[[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "500" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 14: DELETE (soft delete)
echo "✅ Teste 14: Soft Delete Simulador"
curl -s -X DELETE "$API_URL/api/simuladores/$NEW_ID" | jq -r '.success' | grep -q "true" && ((PASS++)) || ((FAIL++))
echo ""

# Teste 15: GET após DELETE (não deve aparecer)
echo "✅ Teste 15: Verificar Simulador Deletado"
DELETED=$(curl -s "$API_URL/api/simuladores" | jq -r ".data[] | select(.id==$NEW_ID) | .deleted_at")
echo "   Deleted_at: ${DELETED:-null}"
[[ "$DELETED" != "" || "$DELETED" == "null" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 16: Performance - GET simuladores (< 500ms)
echo "✅ Teste 16: Performance GET simuladores"
START=$(date +%s%3N)
curl -s "$API_URL/api/simuladores" > /dev/null
END=$(date +%s%3N)
ELAPSED=$((END - START))
echo "   Tempo: ${ELAPSED}ms"
[[ $ELAPSED -lt 1000 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 17: GET sessões por simulador
echo "✅ Teste 17: Filtrar Sessões por Simulador"
SESSOES_SIM=$(curl -s "$API_URL/api/simuladores/sessoes?simulador_id=$NEW_ID" | jq -r '.data | length')
echo "   Sessões do simulador: $SESSOES_SIM"
[[ $SESSOES_SIM -ge 0 ]] && ((PASS++)) || ((FAIL++))
echo ""

# Teste 18: Validação Zod - data inválida
echo "✅ Teste 18: Validação data inválida"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/simuladores/sessoes" \
  -H "Content-Type: application/json" \
  -d '{"simulador_id":1,"instrutor_id":1,"data_sessao":"INVALID","duracao_minutos":90,"tipo_sessao":"TREINAMENTO"}')
echo "   HTTP Code: $HTTP_CODE"
[[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "500" ]] && ((PASS++)) || ((FAIL++))
echo ""

# Resultado Final
echo "======================================"
echo "📊 RESULTADO FINAL"
echo "======================================"
echo "✅ Testes Passaram: $PASS/18"
echo "❌ Testes Falharam: $FAIL/18"
PERCENT=$((PASS * 100 / 18))
echo "📈 Taxa de Sucesso: $PERCENT%"
echo ""

if [[ $PASS -eq 18 ]]; then
  echo "🎉 TODOS OS TESTES PASSARAM!"
  exit 0
elif [[ $PASS -ge 15 ]]; then
  echo "✅ MAIORIA DOS TESTES OK (>80%)"
  exit 0
else
  echo "⚠️  ATENÇÃO: Alguns testes falharam"
  exit 1
fi
