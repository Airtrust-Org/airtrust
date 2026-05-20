#!/bin/bash

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"
FAILED=0

echo "🧪 Testando endpoints de dados mestres..."
echo ""

# Test 1: Qualificações (simplificado)
echo "1️⃣ GET /qualificacoes-list"
RESP=$(curl -s "$BASE_URL/qualificacoes-list")
if echo "$RESP" | grep -q '"success":true'; then
  COUNT=$(echo "$RESP" | jq '.total' 2>/dev/null || echo "?")
  echo "   ✅ OK (${COUNT} qualificações)"
else
  echo "   ❌ FAILED"
  echo "   Response: $RESP"
  ((FAILED++))
fi

# Test 2: Habilitações
echo "2️⃣ GET /habilitacoes"
RESP=$(curl -s "$BASE_URL/habilitacoes")
if echo "$RESP" | grep -q '"success":true'; then
  COUNT=$(echo "$RESP" | jq '.total' 2>/dev/null || echo "?")
  echo "   ✅ OK (${COUNT} habilitações)"
else
  echo "   ❌ FAILED"
  echo "   Response: $RESP"
  ((FAILED++))
fi

# Test 3: Categorias
echo "3️⃣ GET /categorias"
RESP=$(curl -s "$BASE_URL/categorias")
if echo "$RESP" | grep -q '"success":true'; then
  COUNT=$(echo "$RESP" | jq '.total' 2>/dev/null || echo "?")
  echo "   ✅ OK (${COUNT} categorias)"
else
  echo "   ❌ FAILED"
  echo "   Response: $RESP"
  ((FAILED++))
fi

# Test 4: Qualificação individual
echo "4️⃣ GET /qualificacoes-list/1"
RESP=$(curl -s "$BASE_URL/qualificacoes-list/1")
if echo "$RESP" | grep -q '"success":true'; then
  echo "   ✅ OK"
else
  echo "   ⚠️  Not found (expected if ID doesn't exist)"
fi

# Test 5: Categorias com filtro funcionario_id
echo "5️⃣ GET /habilitacoes?funcionario_id=1"
RESP=$(curl -s "$BASE_URL/habilitacoes?funcionario_id=1")
if echo "$RESP" | grep -q '"success":true'; then
  COUNT=$(echo "$RESP" | jq '.total' 2>/dev/null || echo "?")
  echo "   ✅ OK (${COUNT} habilitações para funcionário)"
else
  echo "   ❌ FAILED"
  echo "   Response: $RESP"
  ((FAILED++))
fi

echo ""
echo "================================"
if [ $FAILED -eq 0 ]; then
  echo "✅ Todos os testes passaram!"
  exit 0
else
  echo "❌ $FAILED teste(s) falharam"
  exit 1
fi
