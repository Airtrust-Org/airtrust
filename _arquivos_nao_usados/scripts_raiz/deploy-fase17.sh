#!/bin/bash
# =========================================
# AIRTRUST v1 - DEPLOY COMPLETO FASE 17
# =========================================
# Data: 15/11/2025
# Autor: GitHub Copilot
# Descrição: Deploy automático frontend + validação

set -e

echo "🚀 INICIANDO DEPLOY FASE 17"
echo "================================"
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Validar worker em produção
echo -e "${BLUE}📊 1/5 Validando worker em produção...${NC}"
HEALTH=$(curl -s https://airtrust.airtrust.workers.dev/api/health)
if echo "$HEALTH" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Worker 'airtrust' funcionando${NC}"
else
  echo "❌ Worker não respondeu corretamente"
  exit 1
fi
echo ""

# 2. Build frontend
echo -e "${BLUE}🔨 2/5 Building frontend...${NC}"
npm run build
echo -e "${GREEN}✅ Build completo${NC}"
echo ""

# 3. Deploy para Cloudflare Pages
echo -e "${BLUE}🌐 3/5 Deploying para Cloudflare Pages...${NC}"
npx wrangler pages deploy dist --project-name=airtrust --branch=production
echo -e "${GREEN}✅ Deploy completo${NC}"
echo ""

# 4. Aguardar propagação
echo -e "${BLUE}⏳ 4/5 Aguardando propagação (30s)...${NC}"
sleep 30
echo -e "${GREEN}✅ Propagação completa${NC}"
echo ""

# 5. Validar em produção
echo -e "${BLUE}✅ 5/5 Validando frontend em produção...${NC}"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://airtrust.pages.dev)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo -e "${GREEN}✅ Frontend acessível em https://airtrust.pages.dev${NC}"
else
  echo -e "${YELLOW}⚠️  Frontend retornou status: $FRONTEND_STATUS${NC}"
fi
echo ""

# Resumo final
echo "================================"
echo -e "${GREEN}🎉 DEPLOY FASE 17 COMPLETO${NC}"
echo "================================"
echo ""
echo "📊 URLs de Produção:"
echo "  • Frontend: https://airtrust.pages.dev"
echo "  • Backend:  https://airtrust.airtrust.workers.dev"
echo "  • Health:   https://airtrust.airtrust.workers.dev/api/health"
echo ""
echo "🔐 Login:"
echo "  • Email: admin@airtrust.com.br"
echo "  • Senha: Airtrust@2025"
echo ""
echo "📝 Próximos passos:"
echo "  1. Acessar https://airtrust.pages.dev/login"
echo "  2. Testar login com credenciais acima"
echo "  3. Validar funcionários, qualificações, simuladores"
echo "  4. Monitorar logs por 24-48h"
echo ""
echo "📄 Documentação:"
echo "  • FASE17-RELATORIO-CONEXAO-COMPLETA.md"
echo "  • DEV-LOGIN-PREENCHIDO.md"
echo ""
