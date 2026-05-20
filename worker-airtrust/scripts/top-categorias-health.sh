#!/bin/bash
set -euo pipefail
API="https://airtrust-api.airtrust.workers.dev"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "🔎 Top Categorias Health"
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@airtrust.com","senha":"admin123"}' | jq -r '.data.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then echo -e "${RED}❌ Falha login${NC}"; exit 1; fi

RESP=$(curl -s "$API/api/qualificacoes/historico/top-categorias?limit=5&dias=90" -H "Authorization: Bearer $TOKEN")
SUCCESS=$(echo "$RESP" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then echo -e "${RED}❌ Falha endpoint${NC}"; echo "$RESP"; exit 1; fi

COUNT=$(echo "$RESP" | jq '.data | length')
FIRST=$(echo "$RESP" | jq '.data[0]')

echo -e "${GREEN}✅ Endpoint OK (${COUNT} categorias)${NC}"
echo "$FIRST"
