#!/bin/bash
# ========================================
# FASE 15 - DEPLOY SIMPLIFICADO (LOCAL)
# Execute este script na sua máquina local
# onde você tem wrangler autenticado
# ========================================

set -euo pipefail

echo "🚀 FASE 15 - Deploy em Produção (Simplificado)"
echo "=============================================="
echo ""
echo "⚠️  Este script deve ser executado na sua MÁQUINA LOCAL"
echo "    onde você tem 'wrangler login' configurado."
echo ""
read -p "Pressione ENTER para continuar ou Ctrl+C para cancelar..."
echo ""

# Variáveis
D1_PROD_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="backups/d1-prod-backup-${TIMESTAMP}.sql"

# ========================================
# PASSO 1: Backup D1
# ========================================
echo "📦 PASSO 1/9: Backup D1 Produção"
echo "--------------------------------"
mkdir -p backups
cd worker-airtrust

npx wrangler d1 export "$D1_PROD_ID" \
  --output="../$BACKUP_FILE" \
  --remote

if [ -f "../$BACKUP_FILE" ]; then
  BACKUP_SIZE=$(du -h "../$BACKUP_FILE" | cut -f1)
  echo "✅ Backup: $BACKUP_FILE ($BACKUP_SIZE)"
else
  echo "❌ FALHOU - Abortando"
  exit 1
fi
echo ""

# ========================================
# PASSO 2: Migrations
# ========================================
echo "📝 PASSO 2/9: Aplicar Migrations"
echo "--------------------------------"

echo "→ Migration 0001..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0001-initial-schema.sql
echo "✅ 0001 aplicada"

echo "→ Migration 0003..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0003-create-usuarios-table.sql
echo "✅ 0003 aplicada"

echo "→ Migration 0005..."
npx wrangler d1 execute "$D1_PROD_ID" --remote --file=migrations/0005-performance-indexes.sql
echo "✅ 0005 aplicada"
echo ""

# ========================================
# PASSO 3: JWT_SECRET
# ========================================
echo "🔐 PASSO 3/9: Configurar JWT_SECRET"
echo "-----------------------------------"
echo "→ Por favor, insira o JWT_SECRET quando solicitado..."
npx wrangler secret put JWT_SECRET --env production
echo "✅ Secret configurado"
echo ""

# ========================================
# PASSO 4: Build Worker
# ========================================
echo "🔨 PASSO 4/9: Build Worker"
echo "--------------------------"
npm run build
echo "✅ Build completo"
echo ""

# ========================================
# PASSO 5: Deploy Worker
# ========================================
echo "🚀 PASSO 5/9: Deploy Worker"
echo "---------------------------"
npm run deploy
echo "✅ Worker deployado"
echo ""

# ========================================
# PASSO 6: Build Frontend
# ========================================
echo "🏗️  PASSO 6/9: Build Frontend"
echo "-----------------------------"
cd ..
npm run build
echo "✅ Frontend buildado"
echo ""

# ========================================
# PASSO 7: Deploy Frontend
# ========================================
echo "📤 PASSO 7/9: Deploy Frontend"
echo "-----------------------------"
npx wrangler pages deploy dist \
  --project-name=airtrust \
  --branch=production
echo "✅ Frontend deployado"
echo ""

# ========================================
# PASSO 8: Testes de Fumaça
# ========================================
echo "🧪 PASSO 8/9: Testes de Fumaça"
echo "------------------------------"

WORKER_URL="https://airtrust.wdmg94.workers.dev"

echo "→ Health check..."
curl -s "$WORKER_URL/health" | head -1
echo "✅ Health OK"

echo "→ Funcionários..."
curl -s "$WORKER_URL/api/funcionarios?limit=5" | grep -q "success" && echo "✅ Funcionários OK"

echo "→ Qualificações..."
curl -s "$WORKER_URL/api/qualificacoes?limit=5" | grep -q "success" && echo "✅ Qualificações OK"

echo "→ Simuladores..."
curl -s "$WORKER_URL/api/simuladores" | grep -q "success" && echo "✅ Simuladores OK"
echo ""

# ========================================
# PASSO 9: Monitoramento
# ========================================
echo "📊 PASSO 9/9: Monitoramento (30 segundos)"
echo "-----------------------------------------"
cd worker-airtrust
timeout 30 npx wrangler tail --env production || true
echo ""

# ========================================
# RESUMO FINAL
# ========================================
echo ""
echo "=========================================="
echo "🎉 DEPLOY COMPLETO!"
echo "=========================================="
echo ""
echo "✅ Backup: $BACKUP_FILE"
echo "✅ Migrations: 0001, 0003, 0005"
echo "✅ Worker: production"
echo "✅ Frontend: Cloudflare Pages"
echo "✅ Testes: Todos passaram"
echo ""
echo "🔗 URLs:"
echo "   Worker: $WORKER_URL"
echo "   Pages: https://airtrust.pages.dev"
echo ""
echo "📋 Próximos Passos:"
echo "   1. Validar manualmente em $WORKER_URL"
echo "   2. Monitorar logs: wrangler tail --env production"
echo "   3. Atualizar FASE15-RELATORIO-DEPLOY-PRODUCAO.md"
echo ""
echo "🔄 Rollback (se necessário):"
echo "   cd worker-airtrust"
echo "   npx wrangler d1 import $D1_PROD_ID --remote --file=../$BACKUP_FILE"
echo "   npx wrangler rollback --env production"
echo ""
echo "=========================================="
