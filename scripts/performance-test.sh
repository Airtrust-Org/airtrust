#!/bin/bash

echo "🔍 TESTE DE PERFORMANCE - AIRTRUST"
echo "=================================="
echo "Data: $(date)"
echo ""

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# Função para medir tempo
measure_endpoint() {
  local name=$1
  local endpoint=$2
  local requests=${3:-5}
  
  echo "⏱️  Testando: $name"
  echo "   URL: $API_URL$endpoint"
  
  local total=0
  local min=999
  local max=0
  
  for i in $(seq 1 $requests); do
    local time=$(curl -w "%{time_total}" -o /dev/null -s "$API_URL$endpoint")
    total=$(echo "$total + $time" | bc)
    
    # Comparar min/max
    if (( $(echo "$time < $min" | bc -l) )); then min=$time; fi
    if (( $(echo "$time > $max" | bc -l) )); then max=$time; fi
    
    printf "   [%d/%d] %.3fs\n" $i $requests $time
  done
  
  local avg=$(echo "scale=3; $total / $requests" | bc)
  echo "   📊 Resultados:"
  echo "      • Média: ${avg}s"
  echo "      • Min: ${min}s"
  echo "      • Max: ${max}s"
  
  # Avaliar performance
  if (( $(echo "$avg < 0.5" | bc -l) )); then
    echo "      ✅ EXCELENTE (< 500ms)"
  elif (( $(echo "$avg < 1.0" | bc -l) )); then
    echo "      ⚠️  BOM (< 1s)"
  elif (( $(echo "$avg < 2.0" | bc -l) )); then
    echo "      ⚠️  ACEITÁVEL (< 2s)"
  else
    echo "      ❌ LENTO (> 2s)"
  fi
  
  echo ""
}

# ============================================
# TESTES - ENDPOINTS CRÍTICOS
# ============================================

echo "🚀 INICIANDO TESTES..."
echo ""

# 1. Categorias (base de dados, pouco filtro)
measure_endpoint "Categorias" "/api/v2/categorias"

# 2. Qualificações (mais dados)
measure_endpoint "Qualificações List" "/api/v2/qualificacoes-list"

# 3. Funcionários com paginação
measure_endpoint "Funcionários (page 1)" "/api/v2/funcionarios?limit=20&offset=0"

# 4. Histórico
measure_endpoint "Histórico" "/api/v2/historico?limit=20"

# 5. Simuladores
measure_endpoint "Simuladores" "/api/v2/simuladores"

# 6. Health check
measure_endpoint "Health Check" "/api/health"

# ============================================
# RESUMO FINAL
# ============================================

echo "=================================="
echo "✅ Testes Concluídos!"
echo "📁 Salvar resultado: tee performance-baseline.txt"
echo ""
echo "💡 Próximos passos:"
echo "   1. Comparar com resultado pós-otimização"
echo "   2. Calcular % de melhoria"
echo "   3. Validar cache strategy"
