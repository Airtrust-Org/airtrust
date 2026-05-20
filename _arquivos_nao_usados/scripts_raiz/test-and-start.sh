#!/bin/bash

set -euo pipefail

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       INICIANDO SERVIDORES E TESTANDO AUTENTICAÇÃO        ║"
echo "╚════════════════════════════════════════════════════════════╝"

cd "/Users/filipedaumas/Documents/airtrust v1"

# Kill any existing processes
killall -9 node workerd vite npm 2>/dev/null || true
sleep 2

echo ""
echo "▶️  Iniciando servidores (Frontend + API)..."
npm run dev:all:prod > /tmp/dev-servers.log 2>&1 &
DEV_PID=$!

echo "⏳ Aguardando inicialização (15 segundos)..."
sleep 15

echo ""
echo "🔍 Testando conexão com API..."
echo ""

# Test 1: Sem header de bypass (deve falhar)
echo "❌ Test 1: SEM header X-Dev-Auth-Bypass (esperado: HTTP 401)"
STATUS1=$(curl -s -w "%{http_code}" -o /tmp/test1.json \
  http://localhost:8787/api/funcionarios?limit=1 \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json")
echo "Status: $STATUS1"
if [ "$STATUS1" = "401" ]; then
  echo "✅ Teste 1 PASSOU (401 como esperado)"
else
  echo "❌ Teste 1 FALHOU (esperava 401, recebeu $STATUS1)"
  echo "Resposta:"
  cat /tmp/test1.json | python3 -m json.tool 2>/dev/null || cat /tmp/test1.json
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 2: Com header de bypass (deve funcionar)
echo "✅ Test 2: COM header X-Dev-Auth-Bypass (esperado: HTTP 200)"
STATUS2=$(curl -s -w "%{http_code}" -o /tmp/test2.json \
  http://localhost:8787/api/funcionarios?limit=3 \
  -H "Authorization: Bearer test" \
  -H "X-Dev-Auth-Bypass: 1" \
  -H "Content-Type: application/json")
echo "Status: $STATUS2"
if [ "$STATUS2" = "200" ]; then
  echo "✅ Teste 2 PASSOU (200 como esperado)"
  echo ""
  echo "📊 Dados retornados:"
  cat /tmp/test2.json | python3 -m json.tool 2>/dev/null | head -80
else
  echo "❌ Teste 2 FALHOU (esperava 200, recebeu $STATUS2)"
  echo "Resposta:"
  cat /tmp/test2.json | python3 -m json.tool 2>/dev/null || cat /tmp/test2.json
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""
echo "✅ TESTES COMPLETADOS"
echo ""
echo "🌐 Abra http://localhost:3000 no navegador"
echo "📍 Navegue para Funcionários"
echo "✨ Você deve ver 40 funcionarios na tabela"
echo ""
