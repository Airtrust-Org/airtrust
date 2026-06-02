#!/usr/bin/env bash
set -euo pipefail

# AirTrust full automated deploy script
# Steps: build web, typecheck, publish worker, capture version ID, purge cache

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "LEGACY SCRIPT - do not use for normal deploy"
echo "Use npm run deploy:pages or npm run deploy:worker:safe for standard deploy flows."
echo ""

bash scripts/preflight-clean-deploy.sh

# Usar Node 22 explicitamente — Node 24 tem bug de deadlock com esbuild
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
echo "📦 Node: $(node --version)"

echo "🔨 Build frontend + types"
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node_modules/.bin/vite build >/dev/null 2>&1 || { echo "❌ Build falhou"; exit 1; }

echo "🧪 Worker dry-run bundle"
WORKER_DRY_RUN_DIR=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/airtrust-worker-dry-run-XXXXXX")
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx wrangler deploy \
  --config worker-airtrust/wrangler.toml \
  --env production \
  --dry-run \
  --outdir "$WORKER_DRY_RUN_DIR" \
  >/dev/null 2>&1 || {
    echo "❌ Worker dry-run falhou"
    rm -rf "$WORKER_DRY_RUN_DIR"
    exit 1
  }
rm -rf "$WORKER_DRY_RUN_DIR"

echo "🧪 Guard service worker/cache"
npm run test:guard:sw-cache >/dev/null 2>&1 || { echo "❌ Guard de service worker/cache falhou"; exit 1; }

echo "🛡️ Guard auth boundaries"
bash scripts/guard-auth-boundaries.sh || { echo "❌ Guard de autenticação falhou"; exit 1; }

# Obter commit hash curto como identificador antes do deploy
GIT_COMMIT_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Fonte única de verdade: a versão do APP é o commit.
# O rodapé deve refletir o frontend realmente servido por Cloudflare Pages.
APP_VERSION="$GIT_COMMIT_SHORT"

update_backend_worker_version() {
  local file_path="$1"

  sed -i '' '/^\[env.production.vars\]/,/^\[/{
s/^APP_VERSION = .*/APP_VERSION = "'"$APP_VERSION"'"/
}' "$file_path"

  grep -q "^APP_VERSION = \"$APP_VERSION\"" "$file_path" || {
    echo "❌ Falha ao atualizar APP_VERSION do worker-airtrust"
    exit 1
  }
}

echo "🧷 Carimbando versão no index.html (Pages)"
if [ -f dist/client/index.html ]; then
  # Substitui o placeholder do meta build-version; isso garante que o UI mostre a versão REAL servida
  sed -i '' "s/__BUILD_VERSION__/$APP_VERSION/g" dist/client/index.html
else
  echo "⚠️ dist/client/index.html não encontrado para carimbo de versão"
fi

echo "🧷 Carimbando CACHE_VERSION no sw.js (Service Worker)"
if [ -f dist/client/sw.js ]; then
  # Injeta o commit hash no CACHE_VERSION → toda build invalida o cache do SW automaticamente
  sed -i '' "s/const CACHE_VERSION = '[^']*'/const CACHE_VERSION = 'airtrust-$APP_VERSION'/" dist/client/sw.js
  grep -q "airtrust-$APP_VERSION" dist/client/sw.js && echo "✅ CACHE_VERSION atualizado: airtrust-$APP_VERSION" \
    || echo "⚠️ CACHE_VERSION não encontrado em dist/client/sw.js (verificar manualmente)"
else
  echo "⚠️ dist/client/sw.js não encontrado — Service Worker não carimbado"
fi

bash scripts/remove-duplicate-build-assets.sh

echo "🌐 Deploying Cloudflare Pages (production)"
if command -v wrangler >/dev/null 2>&1; then
  # Produção do Pages é a branch production (domínio airtrust.online)
  # Observação: alguns ambientes têm CLOUDFLARE_API_TOKEN com permissões insuficientes para Pages.
  # Para garantir o deploy, força o wrangler a usar a sessão autenticada (ignora o token env).
  CLOUDFLARE_API_TOKEN= npx wrangler pages deploy dist/client --project-name=airtrust --branch=production >/dev/null 2>&1 || {
    echo "❌ Falha deploy Pages"; exit 1;
  }
  echo "✅ Pages deploy concluído"
else
  echo "⚠️ Wrangler não instalado. Pulei Pages deploy."
fi

echo "🚀 Deploying Worker (wrangler deploy --env production)"
echo "  📌 App Version (git): $APP_VERSION"

DEPLOY_OUTPUT=""
VERSION_ID=""
if command -v wrangler >/dev/null 2>&1; then
  # ANTES de fazer deploy, injetar versão no wrangler.toml
  pushd worker-airtrust >/dev/null

  update_backend_worker_version wrangler.toml
  
  # Captura output do deploy
  DEPLOY_OUTPUT=$(wrangler deploy --env production 2>&1) || { echo "❌ Falha deploy"; popd >/dev/null; exit 1; }
  popd >/dev/null
  
  # Tenta extrair Version ID do output (Current Version ID: xxx-xxx-xxx)
  VERSION_ID=$(echo "$DEPLOY_OUTPUT" | grep 'Current Version ID:' | sed 's/.*Current Version ID: //' | tr -d ' ' || echo "")
  if [ -n "$VERSION_ID" ]; then
    echo "📌 Worker Version ID: $VERSION_ID"
    # Salva version ID em arquivo para uso posterior
    echo "$VERSION_ID" > .deployment_version
  else
    echo "⚠️ Não foi possível capturar Worker Version ID"
  fi
else
  echo "⚠️ Wrangler não instalado. Pulei publish."
fi

## OBS: o domínio airtrust.online é servido por Cloudflare Pages.

# Aguarda propagação (2 segundos)
sleep 2

echo "🧪 Smoke test assets públicos"
bash scripts/smoke-assets-public.sh || { echo "❌ Smoke test de assets/auth falhou"; exit 1; }

if [ -n "${AIRTRUST_SMOKE_EMAIL:-}" ] && [ -n "${AIRTRUST_SMOKE_PASSWORD:-}" ]; then
  echo "🧪 Smoke test Escalas"
  BASE="${AIRTRUST_SMOKE_BASE:-https://airtrust-api-production.airtrust.workers.dev}" \
    AIRTRUST_SMOKE_EMAIL="$AIRTRUST_SMOKE_EMAIL" \
    AIRTRUST_SMOKE_PASSWORD="$AIRTRUST_SMOKE_PASSWORD" \
    bash scripts/smoke-test-alocacao.sh || { echo "❌ Smoke test Escalas falhou"; exit 1; }

  echo "🧪 Smoke test SGSO"
  WEB_BASE="${AIRTRUST_WEB_BASE:-https://airtrust.online}" \
    BASE="${AIRTRUST_SMOKE_BASE:-https://airtrust-api-production.airtrust.workers.dev}" \
    AIRTRUST_SMOKE_EMAIL="$AIRTRUST_SMOKE_EMAIL" \
    AIRTRUST_SMOKE_PASSWORD="$AIRTRUST_SMOKE_PASSWORD" \
    bash scripts/smoke-test-sgso.sh || { echo "❌ Smoke test SGSO falhou"; exit 1; }
else
  echo "ℹ️  Smoke tests autenticados não executados (AIRTRUST_SMOKE_EMAIL/AIRTRUST_SMOKE_PASSWORD ausentes)"
fi

# Quick integrity check endpoint (health)
if [ -n "${AIRTRUST_BASE_URL:-}" ]; then
  echo "🔎 Checando health historico"
  curl -fsS "$AIRTRUST_BASE_URL/api/qualificacoes/historico/health" || echo "⚠️ Health check falhou"
fi

# Exibe a versão que foi deployada
if [ -n "$VERSION_ID" ] && [ "$VERSION_ID" != "unknown" ]; then
  echo "✅ Deploy concluído - Backend Worker Version ID: $VERSION_ID"
fi

if [ -n "$APP_VERSION" ] && [ "$APP_VERSION" != "unknown" ]; then
  echo "✅ App Version (git): $APP_VERSION"
else
  echo "✅ Deploy concluído"
fi

echo "📦 Commit auto (se houver alterações geradas)"
if [ "${SKIP_AUTO_COMMIT:-0}" = "1" ]; then
  echo "ℹ️  Auto-commit desativado via SKIP_AUTO_COMMIT=1"
elif [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "deploy: auto build + publish $(date +%Y-%m-%d\ %H:%M:%S)"
else
  echo "ℹ️  Sem mudanças para commit"
fi

echo "🧹 Limpando cache Cloudflare (purge completo)..."
# Carrega env vars (.env.local tem prioridade para ambiente de dev local)
for ENV_FILE in .env.local .env; do
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
done

# Auto-resolve Zone ID quando só o token estiver disponível
if [ -z "${CLOUDFLARE_ZONE_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  CLOUDFLARE_ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-airtrust.online}"
  echo "  🔎 Descobrindo Zone ID para $CLOUDFLARE_ZONE_NAME..."
  DISCOVERED_ZONE_ID=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=$CLOUDFLARE_ZONE_NAME&status=active&per_page=1" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | \
    /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(((d.get("result") or [{}])[0]).get("id", ""))') || true

  if [ -n "${DISCOVERED_ZONE_ID:-}" ]; then
    CLOUDFLARE_ZONE_ID="$DISCOVERED_ZONE_ID"
    export CLOUDFLARE_ZONE_ID
    echo "  ✅ Zone ID resolvido automaticamente"
  else
    echo "  ⚠️  Não foi possível resolver Zone ID automaticamente"
  fi
fi

# Full purge do cache com múltiplas estratégias
if [ -n "${CLOUDFLARE_ZONE_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "  📌 Zone ID: $CLOUDFLARE_ZONE_ID"
  
  # 1. Purge tudo (everything)
  echo "  ⏳ Purgando TODOS os arquivos do cache..."
  PURGE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache/purge_everything" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json")
  
  if echo "$PURGE_RESPONSE" | grep -q '"success":true'; then
    echo "  ✅ Cache purgado completamente"
  else
    echo "  ⚠️ Resposta inesperada do Cloudflare: $PURGE_RESPONSE"
  fi
  
  # 2. Limpar cache de regra específica (se aplicável)
  echo "  ⏳ Purgando cache de APIs..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache/files" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"files":["https://airtrust-api-production.airtrust.workers.dev/api/*","https://api.airtrust.online/api/*"]}' \
    > /dev/null 2>&1 || echo "  ℹ️  Purge de URLs específicas não configurado"
  
  echo "  ✅ Limpeza de cache finalizada"
else
  echo "  ⚠️ CLOUDFLARE_ZONE_ID ou CLOUDFLARE_API_TOKEN não configurados"
  echo "  Configure em .env ou variáveis de ambiente para purge automático"
  echo "  ℹ️  Purge manual necessário em: https://dash.cloudflare.com"
fi

echo ""
# Atualizar arquivo de versão para o frontend
if [ -n "$APP_VERSION" ] && [ "$APP_VERSION" != "unknown" ]; then
  cat > src/react-app/config/deployment.ts << EOF
export const DEPLOYMENT_VERSION =
  typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : '0.0.0-dev';
EOF
  echo "📝 DEPLOYMENT_VERSION atualizado (git)"
fi

# Re-build frontend com a versão atualizada
echo "🔨 Re-building frontend com versão..."
npm run build >/dev/null 2>&1 || { echo "⚠️ Re-build falhou, continuando"; }

echo "✅ Deploy pipeline concluído"
if [ -n "$APP_VERSION" ] && [ "$APP_VERSION" != "unknown" ]; then
  echo "🎉 App Version (git): $APP_VERSION"
fi
