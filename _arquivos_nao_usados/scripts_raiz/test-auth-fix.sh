#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   TESTE: Autenticação COM o Header X-Dev-Auth-Bypass      ║"
echo "╚════════════════════════════════════════════════════════════╝"

sleep 2

echo ""
echo "🔍 Testando API sem header (deve falhar com 401)..."
curl -s -w "\nStatus: %{http_code}\n" \
  http://localhost:8787/api/funcionarios?limit=1 \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json" 2>&1 | head -20

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""
echo "✅ Testando API COM header X-Dev-Auth-Bypass (deve funcionar)..."
curl -s -w "\nStatus: %{http_code}\n" \
  http://localhost:8787/api/funcionarios?limit=2 \
  -H "Authorization: Bearer test" \
  -H "X-Dev-Auth-Bypass: 1" \
  -H "Content-Type: application/json" | python3 -m json.tool 2>&1 | head -80

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""
echo "✅ Teste completado!"
