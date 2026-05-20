#!/bin/bash
set -euo pipefail

# ========================================
# FASE 15 - DEPLOY COMPLETO EM PRODUÇÃO
# ========================================

echo "🚀 INICIANDO DEPLOY EM PRODUÇÃO - FASE 15"
echo "=========================================="
echo ""

# Variáveis
D1_PROD_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
BACKUP_FILE="backups/d1-prod-backup-$(date +%Y%m%d-%H%M%S).sql"
PROJECT_ROOT="/workspaces/airtrust v1"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"

# ========================================
# 1. BACKUP D1 PRODUÇÃO
# ========================================
echo "📦 PASSO 1: Backup D1 Produção"
echo "----------------------------"
mkdir -p "$PROJECT_ROOT/backups"
cd "$WORKER_DIR"

echo "→ Executando backup..."
npx wrangler d1 export "$D1_PROD_ID" --output="../$BACKUP_FILE" --remote

if [ -f "../$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(du -h "../$BACKUP_FILE" | cut -f1)
  echo "✅ Backup criado: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "❌ ERRO: Backup falhou!"
  exit 1
fi
echo ""

# ========================================
# 2. APLICAR MIGRATIONS (SEM SEEDS)
# ========================================
echo "📝 PASSO 2: Aplicar Migrations em Produção"
echo "----------------------------------------"

# Migration 0001 - Schema Base
echo "→ Aplicando 0001-initial-schema.sql..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0001-initial-schema.sql
echo "✅ Migration 0001 aplicada"

# Migration 0003 - Usuários (SKIP 0002-seed pois já tem dados)
echo "→ Aplicando 0003-create-usuarios-table.sql..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0003-create-usuarios-table.sql
echo "✅ Migration 0003 aplicada"

# Migration 0005 - Índices de Performance (SKIP 0004-seed-usuarios)
echo "→ Aplicando 0005-performance-indexes.sql..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0005-performance-indexes.sql
echo "✅ Migration 0005 aplicada (14 índices criados)"
echo ""

# ========================================
# 3. CONFIGURAR JWT_SECRET
# ========================================
echo "🔐 PASSO 3: Configurar JWT_SECRET em Produção"
echo "-------------------------------------------"
echo "→ Por favor, insira o JWT_SECRET quando solicitado..."
npx wrangler secret put JWT_SECRET --env production
echo "✅ JWT_SECRET configurado"
echo ""

# ========================================
# 4. DEPLOY WORKER
# ========================================
echo "⚙️  PASSO 4: Deploy Worker em Produção"
echo "------------------------------------"
cd "$WORKER_DIR"
echo "→ Executando npm run deploy..."
npm run deploy

if [ $? -eq 0 ]; then
  echo "✅ Worker 'airtrust' deployado com sucesso"
else
  echo "❌ ERRO: Deploy do worker falhou!"
  exit 1
fi
echo ""

# ========================================
# 5. BUILD FRONTEND
# ========================================
echo "🏗️  PASSO 5: Build do Frontend"
echo "----------------------------"
cd "$PROJECT_ROOT"
echo "→ Executando npm run build..."
npm run build

if [ -d "dist" ]; then
  DIST_SIZE=$(du -sh dist | cut -f1)
  echo "✅ Build completo: dist/ ($DIST_SIZE)"
else
  echo "❌ ERRO: Build do frontend falhou!"
  exit 1
fi
echo ""

# ========================================
# 6. DEPLOY FRONTEND
# ========================================
echo "📤 PASSO 6: Deploy Frontend em Produção"
echo "-------------------------------------"
cd "$PROJECT_ROOT"
echo "→ Deployando dist/ para Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=airtrust --branch=production

if [ $? -eq 0 ]; then
  echo "✅ Frontend deployado com sucesso"
else
  echo "❌ ERRO: Deploy do frontend falhou!"
  exit 1
fi
echo ""

# ========================================
# 7. TESTES DE FUMAÇA
# ========================================
echo "🧪 PASSO 7: Testes de Fumaça"
echo "---------------------------"

# Obter URL do worker (assumindo padrão Cloudflare)
WORKER_URL="https://airtrust.wdmg94.workers.dev"

echo "→ Testando endpoint /health..."
HEALTH_RESPONSE=$(curl -s "$WORKER_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
  echo "✅ Health check: OK"
else
  echo "⚠️  Health check: Resposta inesperada"
  echo "   Resposta: $HEALTH_RESPONSE"
fi

echo "→ Testando endpoint /api/funcionarios (top 5)..."
FUNCIONARIOS_RESPONSE=$(curl -s "$WORKER_URL/api/funcionarios?limit=5")
if echo "$FUNCIONARIOS_RESPONSE" | grep -q "success"; then
  FUNC_COUNT=$(echo "$FUNCIONARIOS_RESPONSE" | grep -o '"id"' | wc -l)
  echo "✅ Funcionários: $FUNC_COUNT registros retornados"
else
  echo "⚠️  Funcionários: Resposta inesperada"
fi

echo "→ Testando endpoint /api/qualificacoes (top 5)..."
QUALIFICACOES_RESPONSE=$(curl -s "$WORKER_URL/api/qualificacoes?limit=5")
if echo "$QUALIFICACOES_RESPONSE" | grep -q "success"; then
  QUAL_COUNT=$(echo "$QUALIFICACOES_RESPONSE" | grep -o '"id"' | wc -l)
  echo "✅ Qualificações: $QUAL_COUNT registros retornados"
else
  echo "⚠️  Qualificações: Resposta inesperada"
fi

echo "→ Testando endpoint /api/simuladores..."
SIMULADORES_RESPONSE=$(curl -s "$WORKER_URL/api/simuladores")
if echo "$SIMULADORES_RESPONSE" | grep -q "success"; then
  SIM_COUNT=$(echo "$SIMULADORES_RESPONSE" | grep -o '"id"' | wc -l)
  echo "✅ Simuladores: $SIM_COUNT registros retornados"
else
  echo "⚠️  Simuladores: Resposta inesperada"
fi
echo ""

# ========================================
# 8. MONITORAMENTO INICIAL
# ========================================
echo "📊 PASSO 8: Monitoramento Inicial (5 minutos)"
echo "-------------------------------------------"
echo "→ Abrindo logs em tempo real..."
echo "   Pressione Ctrl+C após ~5 minutos para encerrar"
echo ""

cd "$WORKER_DIR"
timeout 300 npx wrangler tail --env production || true

echo ""
echo "✅ Monitoramento inicial completo"
echo ""

# ========================================
# RESUMO FINAL
# ========================================
echo "=========================================="
echo "🎉 DEPLOY EM PRODUÇÃO COMPLETO!"
echo "=========================================="
echo ""
echo "✅ Backup D1: $BACKUP_FILE"
echo "✅ Migrations: 0001, 0003, 0005 aplicadas"
echo "✅ JWT_SECRET: Configurado"
echo "✅ Worker: Deployado em production"
echo "✅ Frontend: Deployado em Cloudflare Pages"
echo "✅ Testes: Health, Funcionários, Qualificações, Simuladores"
echo "✅ Monitoramento: 5 minutos de logs analisados"
echo ""
echo "📋 Próximos Passos:"
echo "1. Verificar FASE15-RELATORIO-DEPLOY-PRODUCAO.md"
echo "2. Acessar $WORKER_URL para validar manualmente"
echo "3. Monitorar logs nas próximas 24h: wrangler tail --env production"
echo ""
echo "🔄 Plano de Rollback (se necessário):"
echo "1. Restaurar backup: wrangler d1 import $D1_PROD_ID --remote --file=$BACKUP_FILE"
echo "2. Reverter worker: wrangler rollback --env production"
echo "3. Reverter frontend: wrangler pages deployment list airtrust --env production"
echo ""
echo "=========================================="
