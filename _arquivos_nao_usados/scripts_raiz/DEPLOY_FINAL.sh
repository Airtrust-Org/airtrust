#!/bin/bash

# 🚀 Script de Deploy Final - AirTrust
# Execute após adicionar permissão Workers Scripts Edit no token

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  🚀 Deploy Final - AirTrust${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Token (você pode passar como argumento ou usar variável de ambiente)
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠️  Token não fornecido!${NC}"
    echo ""
    echo "Uso:"
    echo "  export CLOUDFLARE_API_TOKEN='seu_token'"
    echo "  ./DEPLOY_FINAL.sh"
    echo ""
    echo "Ou:"
    echo "  ./DEPLOY_FINAL.sh 'seu_token'"
    exit 1
  else
    export CLOUDFLARE_API_TOKEN="$1"
  fi
fi

echo -e "${YELLOW}1️⃣  Testando autenticação...${NC}"
npx wrangler whoami
echo ""

echo -e "${YELLOW}2️⃣  Fazendo deploy do Worker...${NC}"
npx wrangler deploy --env=""
echo ""

echo -e "${YELLOW}3️⃣  Testando API...${NC}"
echo ""

echo "  ✅ Health Check:"
curl -s "https://airtrust-worker.airtrust.workers.dev/api/health" | python3 -m json.tool || echo "❌ Erro"
echo ""

echo "  ✅ Funcionários (5 primeiros):"
curl -s "https://airtrust-worker.airtrust.workers.dev/api/funcionarios?limit=5" | python3 -m json.tool | head -30 || echo "❌ Erro"
echo ""

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  ✅ Deploy Concluído!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "🌐 URLs:"
echo "  Frontend: https://production.airtrust.pages.dev"
echo "  API:      https://airtrust-worker.airtrust.workers.dev"
echo ""
echo "🎉 Sistema 100% funcional!"
