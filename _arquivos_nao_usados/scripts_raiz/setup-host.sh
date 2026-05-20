#!/bin/bash
# ========================================
# AIRTRUST - SETUP PARA AMBIENTE HOST
# Execute este script no seu computador
# para configurar tudo fora do container
# ========================================

set -e

echo "🚀 AirTrust - Setup Ambiente Host"
echo "=================================="
echo ""

# ========================================
# 1. VERIFICAR NODE.JS
# ========================================
echo "📦 1/6: Verificando Node.js..."
echo "------------------------------"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado!"
  echo ""
  echo "Instale Node.js 22+ via:"
  echo "  • https://nodejs.org"
  echo "  • nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "⚠️  Node.js $NODE_VERSION detectado (requer v22+)"
  echo "   Atualize via https://nodejs.org ou nvm"
  exit 1
fi

echo "✅ Node.js $(node -v) OK"
echo "✅ npm $(npm -v) OK"
echo ""

# ========================================
# 2. INSTALAR DEPENDÊNCIAS RAIZ
# ========================================
echo "📦 2/6: Instalando dependências (raiz)..."
echo "-----------------------------------------"

if [ ! -f "package.json" ]; then
  echo "❌ package.json não encontrado!"
  echo "   Execute este script na raiz do projeto AirTrust"
  exit 1
fi

npm install
echo "✅ Dependências raiz instaladas"
echo ""

# ========================================
# 3. INSTALAR DEPENDÊNCIAS WORKER
# ========================================
echo "📦 3/6: Instalando dependências (worker)..."
echo "--------------------------------------------"

if [ ! -d "worker-airtrust" ]; then
  echo "❌ Diretório worker-airtrust/ não encontrado!"
  exit 1
fi

cd worker-airtrust
npm install
cd ..

echo "✅ Dependências worker instaladas"
echo ""

# ========================================
# 4. VERIFICAR/INSTALAR WRANGLER
# ========================================
echo "🔧 4/6: Verificando Wrangler CLI..."
echo "-----------------------------------"

if ! command -v wrangler &> /dev/null; then
  echo "⚠️  Wrangler não encontrado globalmente"
  echo "   Instalando..."
  npm install -g wrangler
  echo "✅ Wrangler instalado"
else
  echo "✅ Wrangler $(wrangler --version) já instalado"
fi
echo ""

# ========================================
# 5. CONFIGURAR WRANGLER AUTH
# ========================================
echo "🔐 5/6: Configurar autenticação Cloudflare..."
echo "----------------------------------------------"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   1. O comando abaixo vai abrir seu navegador"
echo "   2. Faça login na Cloudflare"
echo "   3. Clique em 'Authorize Wrangler'"
echo "   4. Volte ao terminal"
echo ""
read -p "Pressione ENTER para continuar (ou Ctrl+C para pular)..." 

wrangler login

if wrangler whoami &> /dev/null; then
  echo ""
  echo "✅ Autenticação configurada com sucesso!"
  wrangler whoami
else
  echo ""
  echo "⚠️  Autenticação falhou. Execute manualmente:"
  echo "   wrangler login"
fi
echo ""

# ========================================
# 6. CRIAR .ENV.DEVELOPMENT
# ========================================
echo "📝 6/6: Criando .env.development..."
echo "-----------------------------------"

if [ ! -f ".env.development" ]; then
  cat > .env.development << 'EOF'
# AirTrust - Ambiente de Desenvolvimento (Host)

# API URL (Worker local)
VITE_API_URL=http://localhost:8787

# Feature Flags
VITE_ENABLE_DEBUG=true
VITE_ENABLE_ANALYTICS=false

# Auth (DEV MODE - desabilitado)
VITE_AUTH_ENABLED=false
EOF
  echo "✅ .env.development criado"
else
  echo "✅ .env.development já existe"
fi
echo ""

# ========================================
# RESUMO FINAL
# ========================================
echo "=========================================="
echo "🎉 Setup Completo!"
echo "=========================================="
echo ""
echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"
echo "✅ Wrangler $(wrangler --version 2>/dev/null || echo 'instalado')"
echo "✅ Dependências instaladas"
echo "✅ .env.development configurado"
echo ""
echo "📋 Próximos Passos:"
echo ""
echo "1. Rodar Backend (Worker):"
echo "   cd worker-airtrust"
echo "   npm run dev"
echo "   # Acessar: http://localhost:8787"
echo ""
echo "2. Rodar Frontend (em outro terminal):"
echo "   npm run dev"
echo "   # Acessar: http://localhost:5173"
echo ""
echo "3. Testar integração:"
echo "   curl http://localhost:8787/api/health | jq"
echo ""
echo "4. Ver README.md para mais comandos"
echo ""
echo "=========================================="
echo ""
echo "💡 Dica: Para sair do Dev Container no VS Code:"
echo "   Cmd+Shift+P → 'Dev Containers: Reopen Folder Locally'"
echo ""
