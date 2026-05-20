#!/bin/bash
set -euo pipefail

API="https://airtrust-api.airtrust.workers.dev"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔍 VALIDANDO CÓDIGOS NO HISTÓRICO"
echo "================================="

# Login (ajustar credenciais conforme ambiente)
TOKEN=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","senha":"admin123"}' | jq -r '.data.accessToken') || TOKEN=""

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Falha ao obter token (login)${NC}"; exit 1;
fi

RESULT=$(curl -s "$API/api/qualificacoes/historico?limit=5" -H "Authorization: Bearer $TOKEN")

HAS_CODIGO=$(echo "$RESULT" | jq -r '.data[0] | has("qualificacao_codigo")') || HAS_CODIGO="false"

if [ "$HAS_CODIGO" = "true" ]; then
  echo -e "${GREEN}✅ Campo qualificacao_codigo presente${NC}"\n
  echo "Códigos encontrados:";
  echo "$RESULT" | jq -r '.data[] | "\(.id): \(.qualificacao_codigo) - \(.qualificacao_nome)"'
  NULL_COUNT=$(echo "$RESULT" | jq '[.data[] | select(.qualificacao_codigo == null)] | length')
  if [ "$NULL_COUNT" -eq 0 ]; then
    echo -e "\n${GREEN}✅ Todos os códigos preenchidos (nenhum NULL)${NC}"; exit 0;
  else
    echo -e "\n${RED}⚠️  $NULL_COUNT registros com código NULL${NC}"; exit 1;
  fi
else
  echo -e "${RED}❌ Campo qualificacao_codigo AUSENTE${NC}"\n
  echo "Campos disponíveis:";
  echo "$RESULT" | jq -r '.data[0] | keys[]'
  exit 1
fi
