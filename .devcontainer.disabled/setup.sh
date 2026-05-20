#!/bin/bash
set -e

echo "🚀 AirTrust Dev Container - Setup Inicial"
echo "========================================="

# 1. Instalar dependências
echo "📦 Instalando dependências..."
npm install

# 2. Limpar cache antigo
echo "🧹 Limpando cache..."
rm -rf .wrangler dist node_modules/.vite .vite 2>/dev/null || true

# 3. Verificar TypeScript
echo "🔍 Verificando TypeScript..."
npx tsc --version

# 4. Verificar Wrangler
echo "🔍 Verificando Wrangler..."
npx wrangler --version

# 5. Criar .dev.vars se não existir
if [ ! -f .dev.vars ]; then
    echo "📝 Criando .dev.vars..."
    cat > .dev.vars << 'EOF'
JWT_SECRET="dev-secret-key-change-in-production"
GITHUB_TOKEN=""
ENABLE_DEV_AUTH_BYPASS="true"
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_ACCOUNT_ID=""
R2_BUCKET_NAME=""
EOF
fi

echo ""
echo "✅ Setup completo!"
echo ""
echo "📚 Comandos disponíveis:"
echo "  npm run dev          - Frontend (porta 3000)"
echo "  npm run dev:worker   - Backend Wrangler (porta 8787)"
echo "  npm run build        - Build produção"
echo ""
