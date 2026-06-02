#!/usr/bin/env bash
# build-and-deploy.sh
# Usa Node 22 para evitar o esbuild deadlock com Node 24
# Executa: build frontend + deploy worker + deploy Pages

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash scripts/preflight-clean-deploy.sh

# Usar Node 22 explicitamente (Node 24 tem bug de deadlock com esbuild)
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

echo "Node: $(node --version)"
echo "NPM: $(npm --version)"

echo ""
echo "============================================="
echo "⚠️  BANCO DE PRODUÇÃO — alterações são REAIS"
echo "============================================="
echo ""

echo "🔨 Build frontend (Node 22)..."
node_modules/.bin/vite build
bash scripts/remove-duplicate-build-assets.sh
echo "✅ Build concluído"

echo ""
echo "🧪 TypeCheck..."
node_modules/.bin/tsc --noEmit || { echo "❌ TypeCheck falhou"; exit 1; }
echo "✅ TypeCheck OK"

echo ""
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "📌 Git commit: $GIT_COMMIT"

# Carimba versão no index.html
if [ -f dist/client/index.html ]; then
  sed -i '' "s/__BUILD_VERSION__/$GIT_COMMIT/g" dist/client/index.html
  echo "🧷 Versão carimbada: $GIT_COMMIT"
fi

echo ""
echo "🌐 Deploy Cloudflare Pages..."
CLOUDFLARE_API_TOKEN= npx wrangler pages deploy dist/client \
  --project-name=airtrust \
  --branch=production 2>&1 | tail -5
echo "✅ Pages deploy OK"

echo ""
echo "🚀 Deploy Worker..."
cd worker-airtrust

# Atualiza APP_VERSION no wrangler.toml
if grep -q "APP_VERSION = " wrangler.toml; then
  sed -i '' "s/APP_VERSION = .*/APP_VERSION = \"$GIT_COMMIT\"/" wrangler.toml
fi

DEPLOY_OUTPUT=$(wrangler deploy --env production 2>&1)
echo "$DEPLOY_OUTPUT" | tail -5

VERSION_ID=$(echo "$DEPLOY_OUTPUT" | grep 'Current Version ID:' | sed 's/.*Current Version ID: //' | tr -d ' ' || echo "")
if [ -n "$VERSION_ID" ]; then
  echo "📌 Worker Version ID: $VERSION_ID"
fi
cd ..

echo ""
echo "✅ DEPLOY COMPLETO"
echo "   Frontend: https://airtrust.online"
echo "   API: https://airtrust-api-production.airtrust.workers.dev"
echo "   Git: $GIT_COMMIT"
