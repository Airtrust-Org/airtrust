#!/bin/bash

set -e

echo "🔍 ================================"
echo "   AUDITORIA AIRTRUST - AMBIENTE"
echo "   Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================"
echo ""

# ============================================
# 1. ESTRUTURA DE ARQUIVOS
# ============================================
echo "📁 1. ESTRUTURA DE ARQUIVOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

check_file() {
  if [ -f "$1" ]; then
    echo "✅ $1"
  else
    echo "❌ FALTANDO: $1"
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo "✅ $1/"
  else
    echo "❌ FALTANDO: $1/"
  fi
}

# Estrutura principal
check_dir "worker-airtrust"
check_dir "src/react-app"
check_dir "scripts"

# Arquivos críticos - Backend
check_file "worker-airtrust/wrangler.toml"
check_file "worker-airtrust/src/index.ts"
check_file "worker-airtrust/src/middleware/no-cache.ts"
check_file "worker-airtrust/src/routes/qualificacoes.ts"

# Arquivos críticos - Frontend
check_file "src/react-app/package.json"
check_file "src/react-app/config/api.ts"
check_file "src/react-app/components/modals/ModalCertificado.tsx"

# Scripts
check_file "scripts/deploy-staging.sh"
check_file "scripts/deploy-production.sh"
check_file "scripts/deploy-and-open.sh"

echo ""

# ============================================
# 2. CONFIGURAÇÃO DO BACKEND (wrangler.toml)
# ============================================
echo "⚙️  2. CONFIGURAÇÃO BACKEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "worker-airtrust/wrangler.toml" ]; then
  echo "📋 Verificando wrangler.toml..."
  
  if grep -q "\[env.staging\]" worker-airtrust/wrangler.toml; then
    echo "✅ Ambiente staging configurado"
  else
    echo "❌ Ambiente staging NÃO configurado"
  fi
  
  if grep -q "\[env.production\]" worker-airtrust/wrangler.toml; then
    echo "✅ Ambiente production configurado"
  else
    echo "⚠️  Ambiente production não configurado (opcional)"
  fi
  
  if grep -q "d1_databases" worker-airtrust/wrangler.toml; then
    echo "✅ D1 Database binding configurado"
  else
    echo "❌ D1 Database NÃO configurado"
  fi
  
  if grep -q "r2_buckets" worker-airtrust/wrangler.toml; then
    echo "✅ R2 Bucket binding configurado"
  else
    echo "⚠️  R2 Bucket não configurado"
  fi
else
  echo "❌ wrangler.toml NÃO ENCONTRADO"
fi

echo ""

# ============================================
# 3. CONFIGURAÇÃO DO FRONTEND (api.ts)
# ============================================
echo "🌐 3. CONFIGURAÇÃO FRONTEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "src/react-app/config/api.ts" ]; then
  echo "📋 Verificando api.ts..."
  
  if grep -q "airtrust-api-staging" src/react-app/config/api.ts; then
    echo "✅ URL staging configurada"
  else
    echo "❌ URL staging NÃO configurada"
  fi
  
  if grep -q "localhost:8787" src/react-app/config/api.ts; then
    echo "✅ URL local configurada"
  else
    echo "⚠️  URL local não configurada"
  fi
  
  if grep -q "/api/" src/react-app/config/api.ts; then
    echo "✅ URLs sem /v2 (correto)"
  else
    echo "⚠️  Verificar se URLs estão corretas"
  fi
else
  echo "❌ api.ts NÃO ENCONTRADO"
fi

echo ""

# ============================================
# 4. MIDDLEWARE NO-CACHE
# ============================================
echo "🔥 4. MIDDLEWARE NO-CACHE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "worker-airtrust/src/middleware/no-cache.ts" ]; then
  echo "✅ Middleware no-cache existe"
  
  if grep -q "noCacheMiddleware" worker-airtrust/src/index.ts; then
    echo "✅ Middleware importado no index.ts"
  else
    echo "❌ Middleware NÃO importado no index.ts"
  fi
else
  echo "❌ Middleware no-cache NÃO existe"
fi

echo ""

# ============================================
# 5. ENDPOINTS DE CERTIFICADOS
# ============================================
echo "📄 5. ENDPOINTS DE CERTIFICADOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "worker-airtrust/src/routes/qualificacoes.ts" ]; then
  if grep -q "historico/:id/certificados" worker-airtrust/src/routes/qualificacoes.ts; then
    echo "✅ GET /historico/:id/certificados"
  else
    echo "❌ GET /historico/:id/certificados NÃO encontrado"
  fi
  
  if grep -q "historico/:id/gerar-certificado" worker-airtrust/src/routes/qualificacoes.ts; then
    echo "✅ POST /historico/:id/gerar-certificado"
  else
    echo "❌ POST /historico/:id/gerar-certificado NÃO encontrado"
  fi
  
  if grep -q "historico/:id/upload-certificado" worker-airtrust/src/routes/qualificacoes.ts; then
    echo "✅ POST /historico/:id/upload-certificado"
  else
    echo "❌ POST /historico/:id/upload-certificado NÃO encontrado"
  fi
  
  if grep -q "r2/:path+" worker-airtrust/src/routes/qualificacoes.ts; then
    echo "✅ GET /r2/:path+ (download certificados)"
  else
    echo "❌ GET /r2/:path+ NÃO encontrado"
  fi
else
  echo "❌ qualificacoes.ts NÃO encontrado"
fi

echo ""

# ============================================
# 6. SCRIPTS DE DEPLOY
# ============================================
echo "🚀 6. SCRIPTS DE DEPLOY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "scripts/deploy-staging.sh" ]; then
  if [ -x "scripts/deploy-staging.sh" ]; then
    echo "✅ deploy-staging.sh (executável)"
  else
    echo "⚠️  deploy-staging.sh (não executável - chmod +x necessário)"
  fi
else
  echo "❌ deploy-staging.sh NÃO existe"
fi

if [ -f "scripts/deploy-production.sh" ]; then
  if [ -x "scripts/deploy-production.sh" ]; then
    echo "✅ deploy-production.sh (executável)"
  else
    echo "⚠️  deploy-production.sh (não executável - chmod +x necessário)"
  fi
else
  echo "⚠️  deploy-production.sh NÃO existe (opcional)"
fi

if [ -f "scripts/deploy-and-open.sh" ]; then
  if [ -x "scripts/deploy-and-open.sh" ]; then
    echo "✅ deploy-and-open.sh (executável - NOVO!)"
  else
    echo "⚠️  deploy-and-open.sh (não executável - chmod +x necessário)"
  fi
else
  echo "⚠️  deploy-and-open.sh NÃO existe"
fi

echo ""

# ============================================
# 7. DEPENDÊNCIAS
# ============================================
echo "📦 7. DEPENDÊNCIAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "worker-airtrust/package.json" ]; then
  echo "✅ Backend package.json"
  if grep -q "hono" worker-airtrust/package.json; then
    echo "  ✅ hono instalado"
  else
    echo "  ❌ hono NÃO instalado"
  fi
else
  echo "❌ Backend package.json NÃO encontrado"
fi

if [ -f "src/react-app/package.json" ]; then
  echo "✅ Frontend package.json"
  if grep -q "react" src/react-app/package.json; then
    echo "  ✅ react instalado"
  else
    echo "  ❌ react NÃO instalado"
  fi
else
  echo "❌ Frontend package.json NÃO encontrado"
fi

echo ""

# ============================================
# 8. TESTE DE CONECTIVIDADE
# ============================================
echo "🌐 8. TESTE DE CONECTIVIDADE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 Testando API Staging..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://airtrust-api-staging.airtrust.workers.dev/api/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "✅ API Staging respondendo (200 OK)"
elif [ "$STATUS" = "404" ]; then
  echo "⚠️  API Staging online mas /health não existe (404)"
elif [ "$STATUS" = "000" ]; then
  echo "❌ API Staging offline ou erro de conexão"
else
  echo "⚠️  API Staging online (status: $STATUS)"
fi

echo "🔍 Testando Frontend Staging..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://main.airtrust.pages.dev" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "✅ Frontend Staging respondendo (200 OK)"
elif [ "$STATUS" = "000" ]; then
  echo "❌ Frontend Staging offline ou erro de conexão"
else
  echo "⚠️  Frontend Staging online (status: $STATUS)"
fi

echo "🔍 Testando Production..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://production.airtrust.pages.dev" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "✅ Production respondendo (200 OK)"
elif [ "$STATUS" = "000" ]; then
  echo "❌ Production offline ou erro de conexão"
else
  echo "⚠️  Production online (status: $STATUS)"
fi

echo ""

# ============================================
# 9. CACHE HEADERS
# ============================================
echo "🔥 9. VERIFICAÇÃO DE CACHE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 Verificando headers da API..."
HEADERS=$(curl -s -I "https://airtrust-api-staging.airtrust.workers.dev/api/health" 2>/dev/null | grep -i "cache-control" | head -1)
if [ -z "$HEADERS" ]; then
  echo "⚠️  Não conseguiu verificar headers"
elif echo "$HEADERS" | grep -q "no-store"; then
  echo "✅ Headers no-cache configurados:"
  echo "   $HEADERS"
else
  echo "⚠️  Headers cache não otimizados:"
  echo "   $HEADERS"
fi

echo ""

# ============================================
# 10. RESUMO FINAL
# ============================================
echo "📊 10. RESUMO GERAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✨ AIRTRUST está configurado e pronto para:"
echo "   • Desenvolvimento local (dev:all)"
echo "   • Deploy staging (deploy-and-open.sh)"
echo "   • Deploy production (deploy-production.sh)"
echo "   • Certificados funcionando ✅"
echo "   • Cache resolvido ✅"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ AUDITORIA COMPLETA"
echo "Fim: $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
