#!/bin/bash
# =====================================================
# Script de Aplicação da Migração de Backup
# =====================================================

set -e

echo "🔄 Aplicando migração 0150: Sistema de Backup Enterprise"
echo "=========================================="

# Verificar se o arquivo existe
if [ ! -f "migrations/0150_sistema_backup_enterprise.sql" ]; then
  echo "❌ Arquivo de migração não encontrado!"
  exit 1
fi

# Aplicar no ambiente de produção
echo "📤 Aplicando no D1 de produção..."
cd worker-airtrust
wrangler d1 execute DB --remote --file=../migrations/0150_sistema_backup_enterprise.sql
cd ..

echo ""
echo "✅ Migração aplicada com sucesso!"
echo ""
echo "📊 Verificando tabelas criadas..."
wrangler d1 execute DB --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'backups%';"

echo ""
echo "🎉 Sistema de Backup está pronto!"
echo ""
echo "Próximos passos:"
echo "1. Testar backup manual via API"
echo "2. Configurar cron triggers no wrangler.toml"
echo "3. Verificar interface de backup em /configuracoes/backup"
