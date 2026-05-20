#!/bin/bash

# Script para testar ambiente local rapidamente
# Uso: ./test-local.sh

set -e

BASE_URL="http://localhost:8787"

echo "🧪 Testando ambiente local em $BASE_URL"
echo ""

# Verificar se servidor está respondendo
echo "1️⃣  Testando health..."
HEALTH=$(curl -s "$BASE_URL/api/health" 2>/dev/null || echo "ERRO")
if [[ "$HEALTH" == *"healthy"* ]]; then
  echo "   ✅ Health OK"
else
  echo "   ❌ Health FALHOU"
  echo "   ⚠️  Servidor não está respondendo. Execute: ./start-local.sh"
  exit 1
fi

# Testar version
echo "2️⃣  Testando version..."
VERSION=$(curl -s "$BASE_URL/api/version" 2>/dev/null || echo "ERRO")
if [[ "$VERSION" == *"version"* ]]; then
  echo "   ✅ Version OK"
else
  echo "   ❌ Version FALHOU"
fi

# Testar dashboard
echo "3️⃣  Testando dashboard..."
DASHBOARD=$(curl -s "$BASE_URL/api/dashboard" 2>/dev/null || echo "ERRO")
if [[ "$DASHBOARD" == *"success"* ]]; then
  echo "   ✅ Dashboard OK"
  # Verificar se tem metrics e kpis
  if [[ "$DASHBOARD" == *"metrics"* ]] && [[ "$DASHBOARD" == *"kpis"* ]]; then
    echo "   ✅ Dashboard tem metrics e kpis"
  else
    echo "   ⚠️  Dashboard sem metrics/kpis"
  fi
else
  echo "   ❌ Dashboard FALHOU"
fi

# Testar funcionários
echo "4️⃣  Testando funcionários..."
FUNCIONARIOS=$(curl -s "$BASE_URL/api/funcionarios?limit=1" 2>/dev/null || echo "ERRO")
if [[ "$FUNCIONARIOS" == *"success"* ]]; then
  echo "   ✅ Funcionários OK"
else
  echo "   ❌ Funcionários FALHOU"
fi

# Testar compliance
echo "5️⃣  Testando compliance..."
COMPLIANCE=$(curl -s "$BASE_URL/api/compliance" 2>/dev/null || echo "ERRO")
if [[ "$COMPLIANCE" == *"success"* ]]; then
  echo "   ✅ Compliance OK"
else
  echo "   ❌ Compliance FALHOU"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Ambiente local funcionando!"
echo "🌐 Backend: $BASE_URL"
echo "🌐 Frontend: http://localhost:3000 (se rodando)"
echo ""
echo "Para rodar testes completos:"
echo "  ./run-testsprite.sh"
