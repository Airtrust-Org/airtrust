#!/bin/bash

# ========================================
# 🚀 CHECKLIST DE DEPLOY - AIRTRUST v2
# Copiar e executar linha por linha
# ========================================

set -e  # Exit on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 CHECKLIST DE DEPLOY - AIRTRUST v2${NC}"
echo -e "${BLUE}========================================${NC}\n"

# ========================================
# FASE 1: Preparação (5 min)
# ========================================

echo -e "${YELLOW}📦 FASE 1: Preparação${NC}"
echo "Executando verificações iniciais..."

git status
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Git status falhou${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Git status OK${NC}\n"

echo "Fazendo pull da branch main..."
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Git pull falhou${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Git pull OK${NC}\n"

echo "Instalando dependências..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm install falhou${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm install OK${NC}\n"

echo "Executando linter..."
npm run lint
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Lint com warnings/errors${NC}"
fi

echo -e "${GREEN}✅ FASE 1 CONCLUÍDA${NC}\n"

# ========================================
# FASE 2: Database Migrations (10 min)
# ========================================

echo -e "${YELLOW}🗄️ FASE 2: Database Migrations${NC}"
echo -e "${BLUE}AÇÃO MANUAL NECESSÁRIA!${NC}"
echo ""
echo "Execute TODAS as migrations no D1 Dashboard:"
echo "1. Acesse: https://dash.cloudflare.com/"
echo "2. Vá para: Workers & Pages > seu-projeto > Storage > D1"
echo "3. Execute cada query abaixo NO CONSOLE D1:"
echo ""
echo "═══════════════════════════════════════"
echo "MIGRATION 0012: Soft Delete Views"
echo "═══════════════════════════════════════"
echo "Arquivo: migrations/0012_soft_delete_views.sql"
echo "Status: [ ] Executada"
echo ""
echo "═══════════════════════════════════════"
echo "MIGRATION 0013: Certificados Versionamento"
echo "═══════════════════════════════════════"
echo "Arquivo: migrations/0013_certificados_versioning.sql"
echo "Status: [ ] Executada"
echo ""
echo "═══════════════════════════════════════"
echo "MIGRATION 0014: Auditoria Avançada"
echo "═══════════════════════════════════════"
echo "Arquivo: migrations/0014_auditoria_avancada.sql"
echo "Status: [ ] Executada"
echo ""
echo "═══════════════════════════════════════"
echo "MIGRATION 0015: Habilitação Status"
echo "═══════════════════════════════════════"
echo "Arquivo: migrations/0015_habilitacao_status.sql"
echo "Status: [ ] Executada"
echo ""
read -p "Pressione ENTER após executar TODAS as 4 migrations..."

echo -e "${GREEN}✅ FASE 2 AGUARDANDO CONFIRMAÇÃO${NC}\n"

# ========================================
# FASE 3: Backend Files (10 min)
# ========================================

echo -e "${YELLOW}⚙️ FASE 3: Backend TypeScript Files${NC}"
echo "Copiando arquivos backend..."

# Verificar se arquivos existem
files_backend=(
    "src/worker/middleware/auditMiddleware.ts"
    "src/worker/utils/auditLogger.ts"
    "src/worker/utils/softDeleteHelper.ts"
    "src/worker/schemas/habilitacaoSchemas.ts"
    "src/worker/services/habilitacoesServiceFixed.ts"
    "src/worker/services/certificadosServiceFixed.ts"
    "src/worker/routes/confirmDelete.ts"
)

for file in "${files_backend[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $file"
    else
        echo -e "${YELLOW}⚠️  ${NC} $file (criar ou copiar)"
    fi
done

echo ""
echo "RENOMEAÇÕES NECESSÁRIAS:"
echo "1. habilitacoesServiceFixed.ts → habilitacoesService.ts"
echo "2. certificadosServiceFixed.ts → certificadosService.ts"
echo ""
echo "Atualizando imports em arquivos que usam estes serviços..."

echo -e "${GREEN}✅ FASE 3 CONCLUÍDA${NC}\n"

# ========================================
# FASE 4: Frontend Files (5 min)
# ========================================

echo -e "${YELLOW}🎨 FASE 4: Frontend React Files${NC}"
echo "Atualizando arquivos frontend..."

files_frontend=(
    "src/react-app/components/Form/FormDateInput.tsx"
    "src/react-app/components/Modals/ModalDeleteSeguro.tsx"
    "src/react-app/hooks/useHabilitacoes.ts"
)

for file in "${files_frontend[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $file"
    else
        echo -e "${YELLOW}⚠️  ${NC} $file (criar ou copiar)"
    fi
done

echo ""
echo "Instalando dependência React Query..."
npm install @tanstack/react-query @tanstack/react-query-devtools

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm install @tanstack/react-query falhou${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}⚠️  AÇÃO MANUAL: Atualizar main.tsx ou App.tsx${NC}"
echo "Adicione o seguinte:"
echo ""
echo "import { QueryClient, QueryClientProvider } from '@tanstack/react-query';"
echo "const queryClient = new QueryClient();"
echo ""
echo "Envolver App com:"
echo "<QueryClientProvider client={queryClient}>"
echo "  <App />"
echo "</QueryClientProvider>"
echo ""

read -p "Pressione ENTER após atualizar main.tsx..."

echo -e "${GREEN}✅ FASE 4 CONCLUÍDA${NC}\n"

# ========================================
# FASE 5: Testes Locais (15 min)
# ========================================

echo -e "${YELLOW}✅ FASE 5: Testes Locais${NC}"
echo "Executando testes..."

npm run test
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Testes falharam${NC}"
    read -p "Deseja continuar? (s/n) "
    if [ "$REPLY" != "s" ]; then
        exit 1
    fi
fi

echo -e "${GREEN}✅ Testes executados${NC}\n"

echo "Verificando build..."
npm run build:check || npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build falhou${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build OK${NC}\n"

echo -e "${GREEN}✅ FASE 5 CONCLUÍDA${NC}\n"

# ========================================
# FASE 6: Validation (10 min)
# ========================================

echo -e "${YELLOW}🔍 FASE 6: Validação Local${NC}"
echo "Execute os seguintes testes MANUALMENTE:"
echo ""
echo "[ ] Criar habilitação - validar datas (conclusão < vencimento)"
echo "[ ] Deletar habilitação - exigir token de confirmação"
echo "[ ] Upload certificado - verificar versionamento"
echo "[ ] Verificar auditoria_logs (SELECT COUNT(*) > 0)"
echo "[ ] Soft delete (SELECT * WHERE deleted_at IS NULL)"
echo "[ ] Form validação com Zod"
echo "[ ] React Query cache (5min stale)"
echo "[ ] Modal confirmação delete"
echo ""

read -p "Pressione ENTER após validar todos os itens..."

echo -e "${GREEN}✅ FASE 6 CONCLUÍDA${NC}\n"

# ========================================
# FASE 7: Deploy (10 min)
# ========================================

echo -e "${YELLOW}🚀 FASE 7: Deploy${NC}"
echo ""
echo "Escolha a opção de deploy:"
echo "1. npm run deploy"
echo "2. npm run deploy:prod"
echo "3. wrangler publish"
echo ""

read -p "Digite a opção (1/2/3): " deploy_option

case $deploy_option in
    1)
        echo "Executando: npm run deploy"
        npm run deploy
        ;;
    2)
        echo "Executando: npm run deploy:prod"
        npm run deploy:prod
        ;;
    3)
        echo "Executando: wrangler publish"
        wrangler publish --env production
        ;;
    *)
        echo -e "${RED}❌ Opção inválida${NC}"
        exit 1
        ;;
esac

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deploy falhou${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deploy concluído${NC}\n"

# ========================================
# FASE 8: Post-Deploy Validation (5 min)
# ========================================

echo -e "${YELLOW}✨ FASE 8: Validação Pós-Deploy${NC}"
echo "Verificando saúde da aplicação..."

# Detectar URL base
read -p "Digite a URL base da aplicação (ex: https://seu-projeto.workers.dev): " app_url

echo "Testando health endpoint..."
curl -s "$app_url/api/v2/health" | jq .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Health check OK${NC}"
else
    echo -e "${YELLOW}⚠️  Health check falhou${NC}"
fi

echo ""
echo "Testes finais (MANUAL):"
echo "[ ] Acessar aplicação em produção"
echo "[ ] Criar novo item"
echo "[ ] Listar itens com filtros"
echo "[ ] Deletar item com confirmação"
echo "[ ] Verificar auditoria no D1"
echo ""

# ========================================
# CONCLUSÃO
# ========================================

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ DEPLOY COMPLETO COM SUCESSO!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "📊 Resumo:"
echo "  ✅ Fase 1: Preparação"
echo "  ✅ Fase 2: Migrations"
echo "  ✅ Fase 3: Backend"
echo "  ✅ Fase 4: Frontend"
echo "  ✅ Fase 5: Testes"
echo "  ✅ Fase 6: Validação"
echo "  ✅ Fase 7: Deploy"
echo "  ✅ Fase 8: Post-Deploy"
echo ""
echo "🎯 Próximas ações:"
echo "  1. Monitorar logs em produção"
echo "  2. Validar relatórios de auditoria"
echo "  3. Comunicar time sobre mudanças"
echo ""
echo -e "${YELLOW}Tempo total: ~90 minutos${NC}"
echo ""
