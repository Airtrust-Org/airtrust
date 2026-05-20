#!/bin/bash

# ==========================================
# SETUP: CUSTOM DOMAIN AIRTRUST
# ==========================================

echo "🔧 AirTrust Custom Domain Setup"
echo "================================"
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ==========================================
# STEP 1: Verify Wrangler Login
# ==========================================
echo "${BLUE}[STEP 1]${NC} Verificando login no Wrangler..."
if ! wrangler whoami > /dev/null 2>&1; then
    echo "${RED}❌ Você não está logado no Wrangler${NC}"
    echo "Execute: wrangler login"
    exit 1
fi
echo "${GREEN}✅ Logado com sucesso${NC}"
echo ""

# ==========================================
# STEP 2: Get Worker Info
# ==========================================
echo "${BLUE}[STEP 2]${NC} Obtendo informações do Worker..."

WORKER_ID="0199d03e-fe13-77d7-a6e7-7d94d446894b"
CUSTOM_DOMAIN="airtrust.system.workers.dev"
CUSTOM_DOMAIN_WILDCARD="${CUSTOM_DOMAIN}/*"

echo "  Worker ID: $WORKER_ID"
echo "  Custom Domain: $CUSTOM_DOMAIN"
echo ""

# ==========================================
# STEP 3: Check Current Triggers/Routes
# ==========================================
echo "${BLUE}[STEP 3]${NC} Verificando rotas atuais..."
echo ""
wrangler triggers
echo ""

# ==========================================
# STEP 4: Add Custom Domain Route
# ==========================================
echo "${BLUE}[STEP 4]${NC} Adicionando rota para custom domain..."
echo "Comando: wrangler triggers update --routes ${CUSTOM_DOMAIN_WILDCARD} ${WORKER_ID}"
echo ""

read -p "Deseja continuar? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    wrangler triggers update --routes "${CUSTOM_DOMAIN_WILDCARD}" "${WORKER_ID}"
    if [ $? -eq 0 ]; then
        echo "${GREEN}✅ Rota adicionada com sucesso!${NC}"
    else
        echo "${RED}❌ Erro ao adicionar rota${NC}"
        echo "Tente via Dashboard: https://dash.cloudflare.com"
        exit 1
    fi
else
    echo "${YELLOW}⏭️  Pulando configuração de rota${NC}"
fi
echo ""

# ==========================================
# STEP 5: Verify Routes
# ==========================================
echo "${BLUE}[STEP 5]${NC} Verificando rotas configuradas..."
echo ""
wrangler triggers
echo ""

# ==========================================
# STEP 6: Test URLs
# ==========================================
echo "${BLUE}[STEP 6]${NC} Testando URLs..."
echo ""

echo "  Testando URL Automática..."
curl -s "https://${WORKER_ID}.airtrust.workers.dev/api/v2/sistema/health" > /tmp/auto_health.json
if [ -f /tmp/auto_health.json ] && grep -q "HEALTHY" /tmp/auto_health.json; then
    echo "  ${GREEN}✅ URL Automática: OK${NC}"
    AUTO_HEALTH="OK"
else
    echo "  ${RED}❌ URL Automática: FAIL${NC}"
    AUTO_HEALTH="FAIL"
fi

echo ""
echo "  Testando URL Custom..."
curl -s "https://${CUSTOM_DOMAIN}/api/v2/sistema/health" > /tmp/custom_health.json
if [ -f /tmp/custom_health.json ] && grep -q "HEALTHY" /tmp/custom_health.json; then
    echo "  ${GREEN}✅ URL Custom: OK${NC}"
    CUSTOM_HEALTH="OK"
else
    echo "  ${RED}❌ URL Custom: FAIL (Normal se acabou de configurar)${NC}"
    CUSTOM_HEALTH="FAIL"
fi

echo ""

# ==========================================
# STEP 7: Update Frontend Config
# ==========================================
echo "${BLUE}[STEP 7]${NC} Qual URL usar no frontend?"
echo ""
echo "  1) URL Automática: https://${WORKER_ID}.airtrust.workers.dev"
echo "  2) URL Custom: https://${CUSTOM_DOMAIN}"
echo ""

if [ "$CUSTOM_HEALTH" = "OK" ]; then
    echo "  Recomendação: ${GREEN}URL Custom (já funciona)${NC}"
    read -p "Escolha (1 ou 2) [padrão: 2]: " choice
    choice=${choice:-2}
else
    echo "  Recomendação: ${YELLOW}URL Automática (custom ainda não funciona)${NC}"
    read -p "Escolha (1 ou 2) [padrão: 1]: " choice
    choice=${choice:-1}
fi

if [ "$choice" = "1" ]; then
    API_URL="https://${WORKER_ID}.airtrust.workers.dev/api"
    echo "  Usando: ${BLUE}$API_URL${NC}"
elif [ "$choice" = "2" ]; then
    API_URL="https://${CUSTOM_DOMAIN}/api"
    echo "  Usando: ${BLUE}$API_URL${NC}"
else
    echo "${RED}Opção inválida${NC}"
    exit 1
fi

# ==========================================
# STEP 8: Update .env.production
# ==========================================
echo ""
echo "${BLUE}[STEP 8]${NC} Atualizando .env.production..."

if [ -f .env.production ]; then
    # Backup
    cp .env.production .env.production.backup
    echo "  Backup criado: ${GREEN}.env.production.backup${NC}"
    
    # Update or create
    if grep -q "VITE_API_URL" .env.production; then
        sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=${API_URL}|" .env.production
    else
        echo "VITE_API_URL=${API_URL}" >> .env.production
    fi
else
    echo "VITE_API_URL=${API_URL}" > .env.production
fi

echo "  ${GREEN}✅ .env.production atualizado${NC}"
echo "  VITE_API_URL=${API_URL}"
echo ""

# ==========================================
# STEP 9: Summary
# ==========================================
echo "${BLUE}[RESUMO]${NC}"
echo "========================================"
echo "  Worker ID: ${GREEN}${WORKER_ID}${NC}"
echo "  URL Automática: ${GREEN}https://${WORKER_ID}.airtrust.workers.dev${NC}"
echo "  URL Custom: ${GREEN}https://${CUSTOM_DOMAIN}${NC}"
echo ""
echo "  Status URLs:"
echo "    Automática: ${AUTO_HEALTH}"
echo "    Custom: ${CUSTOM_HEALTH}"
echo ""
echo "  Frontend API URL:"
echo "    ${GREEN}${API_URL}${NC}"
echo ""
echo "========================================"
echo ""

# ==========================================
# STEP 10: Next Steps
# ==========================================
echo "${BLUE}[PRÓXIMOS PASSOS]${NC}"
echo ""
echo "1. Re-build frontend:"
echo "   ${YELLOW}npm run build${NC}"
echo ""
echo "2. Deploy:"
echo "   ${YELLOW}wrangler deploy${NC}"
echo ""
echo "3. Aguarde 30-60 segundos para propagação DNS"
echo ""
echo "4. Teste no navegador:"
if [ "$choice" = "2" ] && [ "$CUSTOM_HEALTH" = "OK" ]; then
    echo "   ${YELLOW}https://${CUSTOM_DOMAIN}${NC}"
else
    echo "   ${YELLOW}https://${WORKER_ID}.airtrust.workers.dev${NC}"
fi
echo ""
echo "5. Se tiver problema, verifique Dashboard:"
echo "   ${YELLOW}https://dash.cloudflare.com/workers/${WORKER_ID}${NC}"
echo ""

echo "${GREEN}✅ Setup concluído!${NC}"
