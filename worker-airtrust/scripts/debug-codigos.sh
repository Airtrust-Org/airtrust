#!/bin/bash
set -euo pipefail
API="https://airtrust-api.airtrust.workers.dev"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "🔍 DEBUG - CÓDIGOS NÃO APARECEM"
echo "================================="

# 1. VIEW existence
echo "1️⃣ Verificando VIEW qualificacoes_historico_v..."
VIEW_EXISTS=$(npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='view' AND name='qualificacoes_historico_v'" --json 2>/dev/null | jq -r '.[0].results[0].c' || echo 0)
if [ "$VIEW_EXISTS" != "1" ]; then
  echo -e "${RED}❌ VIEW não existe${NC}"; exit 1;
else
  echo -e "${GREEN}✅ VIEW existe${NC}";
fi

# 2. Sample from VIEW
echo "\n2️⃣ Verificando dados (qualificacao_codigo) na VIEW..."
VIEW_SAMPLE=$(npx wrangler d1 execute DB --remote --command "SELECT id, qualificacao_codigo, qualificacao_nome FROM qualificacoes_historico_v LIMIT 3" --json 2>/dev/null)
echo "$VIEW_SAMPLE" | jq '.[0].results'
FIRST_CODE=$(echo "$VIEW_SAMPLE" | jq -r '.[0].results[0].qualificacao_codigo' || echo null)
if [ -z "$FIRST_CODE" ] || [ "$FIRST_CODE" = "null" ]; then
  echo -e "${RED}❌ VIEW retornou qualificacao_codigo NULL${NC}"; exit 1;
else
  echo -e "${GREEN}✅ VIEW retornou código: $FIRST_CODE${NC}";
fi

# 3. API login
echo "\n3️⃣ Realizando login API..."
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@airtrust.com","senha":"admin123"}' | jq -r '.data.accessToken' || echo "")
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Falha ao obter token${NC}"; exit 1;
fi
echo -e "${GREEN}✅ Token obtido${NC}";

# 4. API sample
echo "\n4️⃣ Verificando endpoint /api/qualificacoes/historico..."
API_SAMPLE=$(curl -s "$API/api/qualificacoes/historico?limit=1" -H "Authorization: Bearer $TOKEN")
echo "$API_SAMPLE" | jq '.data[0]'
API_CODE=$(echo "$API_SAMPLE" | jq -r '.data[0].qualificacao_codigo' || echo null)
if [ -z "$API_CODE" ] || [ "$API_CODE" = "null" ]; then
  echo -e "${RED}❌ API retornou qualificacao_codigo NULL ou ausente${NC}";
  echo "Campos retornados:"; echo "$API_SAMPLE" | jq -r '.data[0] | keys[]'; exit 1;
else
  echo -e "${GREEN}✅ API retorna código: $API_CODE${NC}";
fi

# 5. Resumo
echo "\n================================="
echo -e "${GREEN}✅ Diagnóstico concluído sem falhas${NC}";
echo "Se front não exibe, revisar componente de tabela para usar qualificacao_codigo fallback."