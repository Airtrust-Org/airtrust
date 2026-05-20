#!/bin/bash
# ==========================================
# AUDITORIA COMPLETA DE ENDPOINTS - SIMULADORES
# Data: 2025-11-20
# ==========================================

API_URL="${1:-http://localhost:8787/api}"
TOTAL=0
SUCCESS=0
FAILED=0

echo "🔍 INICIANDO AUDITORIA DE ENDPOINTS"
echo "📡 API: $API_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Função para testar endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local desc=$3
  local data=$4
  
  TOTAL=$((TOTAL + 1))
  echo -n "[$TOTAL] $method $path - $desc ... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s "$API_URL$path")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" "$API_URL$path")
  elif [ "$method" = "PUT" ]; then
    response=$(curl -s -X PUT -H "Content-Type: application/json" -d "$data" "$API_URL$path")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -X DELETE "$API_URL$path")
  fi
  
  success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
  error=$(echo "$response" | jq -r '.error // ""' 2>/dev/null)
  
  if [ "$success" = "true" ]; then
    echo "✅ OK"
    SUCCESS=$((SUCCESS + 1))
    data_count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
    if [ "$data_count" != "0" ] && [ "$data_count" != "null" ]; then
      echo "    📊 Dados retornados: $data_count"
    fi
  else
    echo "❌ FALHOU"
    FAILED=$((FAILED + 1))
    if [ -n "$error" ] && [ "$error" != "null" ]; then
      echo "    ⚠️  Erro: $error"
    fi
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MÓDULO: SIMULADORES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Health Check
test_endpoint "GET" "/health" "Health Check"

# Simuladores
test_endpoint "GET" "/simuladores" "Listar simuladores"
test_endpoint "GET" "/simuladores?page=1&limit=10" "Listar com paginação"

# Sessões
test_endpoint "GET" "/simuladores/sessoes" "Listar sessões"
test_endpoint "GET" "/simuladores/sessoes?page=1&limit=10" "Listar sessões paginadas"
test_endpoint "GET" "/simuladores/sessoes?simulador_id=1" "Filtrar por simulador"
test_endpoint "GET" "/simuladores/sessoes?status=AGENDADA" "Filtrar por status"

# Fichas
test_endpoint "GET" "/simuladores/fichas" "Listar fichas"
test_endpoint "GET" "/simuladores/fichas?page=1&limit=10" "Listar fichas paginadas"
test_endpoint "GET" "/simuladores/fichas?funcionario_id=1" "Filtrar por funcionário"
test_endpoint "GET" "/simuladores/fichas?status=PENDENTE" "Filtrar por status"

# Modelos de Sessão
test_endpoint "GET" "/simuladores/modelos" "Listar modelos"
test_endpoint "GET" "/simuladores/modelos/1" "Buscar modelo por ID"
test_endpoint "GET" "/simuladores/modelos/1/manobras" "Listar manobras do modelo"
test_endpoint "GET" "/simuladores/modelos/4/manobras" "Manobras modelo A139-I-04"

# Instrutores
test_endpoint "GET" "/simuladores/instrutores" "Listar instrutores"

# Participantes
test_endpoint "GET" "/simuladores/sessoes/participantes" "Listar participantes"

# Dashboards/Relatórios
test_endpoint "GET" "/simuladores/dashboard/estatisticas" "Dashboard estatísticas"
test_endpoint "GET" "/simuladores/dashboard/funcionarios" "Dashboard funcionários"
test_endpoint "GET" "/simuladores/dashboard/progresso" "Dashboard progresso"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTADO DA AUDITORIA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sucesso: $SUCCESS / $TOTAL"
echo "❌ Falhas:  $FAILED / $TOTAL"

if [ $FAILED -eq 0 ]; then
  echo "🎉 TODOS OS ENDPOINTS FUNCIONANDO!"
  exit 0
else
  PERCENT=$((SUCCESS * 100 / TOTAL))
  echo "📈 Taxa de sucesso: $PERCENT%"
  exit 1
fi
