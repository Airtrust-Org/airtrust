#!/bin/bash

# 🔑 Script para Configurar D1 com Novo Token
# Use: ./setup-d1-with-new-token.sh "SEU_NOVO_TOKEN_AQUI"

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verificar se o token foi fornecido
if [ -z "$1" ]; then
  echo -e "${RED}❌ Token não fornecido!${NC}"
  echo ""
  echo "Uso: ./setup-d1-with-new-token.sh \"SEU_TOKEN_AQUI\""
  echo ""
  echo "Exemplo:"
  echo "  ./setup-d1-with-new-token.sh \"v1.0-abc123xyz...\""
  exit 1
fi

TOKEN="$1"

# Exportar o token
export CLOUDFLARE_API_TOKEN="$TOKEN"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  🚀 Configurando D1 + Worker${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# 1. Testar autenticação
echo -e "${YELLOW}1️⃣  Testando autenticação...${NC}"
if npx wrangler whoami 2>&1 | grep -q "Account ID"; then
  echo -e "${GREEN}✅ Autenticado com sucesso!${NC}"
else
  echo -e "${RED}❌ Falha na autenticação. Token inválido?${NC}"
  exit 1
fi
echo ""

# 2. Listar tabelas D1
echo -e "${YELLOW}2️⃣  Verificando banco D1...${NC}"
npx wrangler d1 execute airtrust-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>&1 || true
echo ""

# 3. Aplicar migrations
echo -e "${YELLOW}3️⃣  Aplicando migrations D1...${NC}"
npx wrangler d1 migrations apply airtrust-db --remote 2>&1 || true
echo ""

# 4. Deploy Worker
echo -e "${YELLOW}4️⃣  Deployando Worker...${NC}"
npx wrangler deploy --env="" 2>&1 | tail -20
echo ""

# 5. Testar API
echo -e "${YELLOW}5️⃣  Testando API...${NC}"
echo ""

echo "  Testando /api/health:"
curl -s "https://airtrust-worker.airtrust.workers.dev/api/health" | python3 -m json.tool 2>/dev/null || echo "  ❌ Erro ao acessar /api/health"
echo ""

echo "  Testando /api/historico:"
curl -s "https://airtrust-worker.airtrust.workers.dev/api/historico?limit=5" | python3 -m json.tool 2>/dev/null || echo "  ❌ Erro ao acessar /api/historico"
echo ""

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  ✅ Configuração concluída!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "🌐 URLs disponíveis:"
echo "  Frontend: https://production.airtrust.pages.dev"
echo "  API: https://airtrust-worker.airtrust.workers.dev"
echo ""
echo "💾 Para usar este token no futuro:"
echo "  export CLOUDFLARE_API_TOKEN=\"$TOKEN\""
echo ""
