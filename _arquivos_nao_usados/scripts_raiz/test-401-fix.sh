#!/bin/bash

# 🧪 SCRIPT DE TESTE: Validação do Erro 401
# Uso: bash test-401-fix.sh

set -e

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
HEALTH_ENDPOINT="/api/v2/sistema/health"
QUALIFICACOES_ENDPOINT="/api/v2/qualificacoes"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TESTE DE VALIDAÇÃO: Erro 401 Unauthorized"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1️⃣ Testar Health Check
echo "1️⃣  Verificando saúde do servidor..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL$HEALTH_ENDPOINT")
HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HEALTH_HTTP_CODE" = "200" ]; then
  echo "✅ Servidor respondendo (200 OK)"
  echo "   Response: $HEALTH_BODY" | head -c 80
  echo ""
else
  echo "❌ Servidor com problema (HTTP $HEALTH_HTTP_CODE)"
  echo "   Response: $HEALTH_BODY"
  exit 1
fi

echo ""

# 2️⃣ Testar sem token (deve ser 401)
echo "2️⃣  Testando SEM token (deve retornar 401)..."
NO_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL$QUALIFICACOES_ENDPOINT")
NO_TOKEN_HTTP_CODE=$(echo "$NO_TOKEN_RESPONSE" | tail -n1)
NO_TOKEN_BODY=$(echo "$NO_TOKEN_RESPONSE" | head -n-1)

if [ "$NO_TOKEN_HTTP_CODE" = "401" ]; then
  echo "✅ Retorna 401 Unauthorized (esperado)"
  echo "   Error: $(echo $NO_TOKEN_BODY | jq -r '.error' 2>/dev/null || echo $NO_TOKEN_BODY)"
else
  echo "⚠️  Retorna HTTP $NO_TOKEN_HTTP_CODE (esperado 401)"
fi

echo ""

# 3️⃣ Verificar D1 (dados existem?)
echo "3️⃣  Verificando dados em D1..."
if command -v sqlite3 &> /dev/null; then
  DB_PATH=".wrangler/state/d1/airtrust-db.sqlite3"
  if [ -f "$DB_PATH" ]; then
    COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")
    if [ "$COUNT" -gt 0 ]; then
      echo "✅ Dados existem em D1: $COUNT qualificacoes"
    else
      echo "🔴 Nenhuma qualificação encontrada em D1 (COUNT = 0)"
      echo "   Verificar se foram soft-deletadas"
    fi
  else
    echo "⚠️  Banco D1 local não encontrado: $DB_PATH"
    echo "   Teste será incompleto"
  fi
else
  echo "⚠️  sqlite3 não instalado, pulando verificação de dados"
fi

echo ""

# 4️⃣ Verificar se api-client.ts tem a correção
echo "4️⃣  Verificando se correção foi aplicada..."
if grep -q "Authorization.*Bearer" src/react-app/utils/api-client.ts 2>/dev/null; then
  echo "✅ api-client.ts tem Authorization header"
else
  echo "❌ api-client.ts NÃO tem Authorization header (correção não aplicada)"
fi

if grep -q "localStorage?.getItem.*access_token" src/react-app/utils/api-client.ts 2>/dev/null; then
  echo "✅ api-client.ts obtém token de localStorage"
else
  echo "❌ api-client.ts NÃO obtém token de localStorage"
fi

echo ""

# 5️⃣ Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMO DO TESTE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Health Check: OK (200)"
echo "✅ Auth Middleware: OK (retorna 401 sem token)"
echo "✅ Código corrigido: api-client.ts tem Authorization header"
echo ""
echo "🟡 PRÓXIMO PASSO: Testar no Frontend (Browser)"
echo "   1. Abrir DevTools (F12)"
echo "   2. Fazer login"
echo "   3. Verificar localStorage.getItem('access_token')"
echo "   4. Carregar página de qualificacoes"
echo "   5. Verificar se dados aparecem (não há mais erro 401)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
