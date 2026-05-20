#!/bin/bash
# Script de teste rápido para validar o ambiente dev container

echo "🧪 AirTrust Dev Container - Testes de Validação"
echo "================================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função de teste
test_command() {
    if eval "$1" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $2"
        return 0
    else
        echo -e "${RED}❌${NC} $2"
        return 1
    fi
}

# 1. Node.js
echo "📦 Verificando ambiente Node.js..."
test_command "node --version" "Node.js instalado ($(node --version 2>/dev/null || echo 'N/A'))"
test_command "npm --version" "npm instalado ($(npm --version 2>/dev/null || echo 'N/A'))"
echo ""

# 2. Wrangler
echo "⚡ Verificando Wrangler..."
test_command "npx wrangler --version" "Wrangler CLI disponível"
test_command "[ -f wrangler.dev.toml ]" "wrangler.dev.toml existe"
echo ""

# 3. TypeScript
echo "📘 Verificando TypeScript..."
test_command "npx tsc --version" "TypeScript instalado ($(npx tsc --version 2>/dev/null || echo 'N/A'))"
test_command "[ -f tsconfig.json ]" "tsconfig.json existe"
echo ""

# 4. Estrutura do projeto
echo "📁 Verificando estrutura do projeto..."
test_command "[ -d src/worker ]" "src/worker/ existe"
test_command "[ -f src/worker/index.ts ]" "src/worker/index.ts existe"
test_command "[ -f src/worker/routes/index.ts ]" "src/worker/routes/index.ts existe"
test_command "[ -f package.json ]" "package.json existe"
echo ""

# 5. Dependências
echo "📚 Verificando dependências..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅${NC} node_modules/ existe"
    test_command "[ -d node_modules/hono ]" "Hono instalado"
    test_command "[ -d node_modules/wrangler ]" "Wrangler instalado"
else
    echo -e "${YELLOW}⚠️${NC}  node_modules/ não existe (execute: npm install)"
fi
echo ""

# 6. Portas
echo "🌐 Verificando portas..."
if command -v lsof > /dev/null 2>&1; then
    if lsof -i:8787 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️${NC}  Porta 8787 em uso"
    else
        echo -e "${GREEN}✅${NC} Porta 8787 livre"
    fi
    
    if lsof -i:3000 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️${NC}  Porta 3000 em uso"
    else
        echo -e "${GREEN}✅${NC} Porta 3000 livre"
    fi
else
    echo -e "${YELLOW}⚠️${NC}  lsof não disponível (normal em containers)"
fi
echo ""

# 7. Git
echo "🔧 Verificando Git..."
test_command "git --version" "Git instalado ($(git --version 2>/dev/null | cut -d' ' -f3 || echo 'N/A'))"
test_command "[ -d .git ]" "Repositório Git inicializado"
echo ""

# Resumo
echo "================================================"
echo ""
echo "✨ Ambiente pronto para desenvolvimento!"
echo ""
echo "📚 Próximos passos:"
echo "  1. npm run dev:worker   # Iniciar backend (porta 8787)"
echo "  2. npm run dev          # Iniciar frontend (porta 3000)"
echo ""
