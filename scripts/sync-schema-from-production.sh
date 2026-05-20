#!/bin/bash
# scripts/sync-schema-from-production.sh
# Sincroniza schema de produção para ambiente local

set -e

echo "🔄 Sincronizando schema de produção para local..."
echo ""

# Backup do database local atual
if [ -d "worker-airtrust/.wrangler/state/v3/d1" ]; then
  BACKUP_DIR="backups/local-db-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  cp -r worker-airtrust/.wrangler/state/v3/d1/* "$BACKUP_DIR/" 2>/dev/null || true
  echo "✅ Backup criado em: $BACKUP_DIR"
fi

# Limpar database local
echo "🗑️  Limpando database local..."
rm -rf worker-airtrust/.wrangler/state/v3/d1/

# Aplicar todas migrations localmente na ordem
echo "📦 Aplicando migrations..."
cd worker-airtrust

for migration in migrations/*.sql; do
  if [ -f "$migration" ]; then
    echo "  ⚙️  $(basename $migration)"
    npx wrangler d1 execute DB --local --file="$migration" --yes > /dev/null 2>&1 || {
      echo "  ❌ Erro em: $(basename $migration)"
      exit 1
    }
  fi
done

echo ""
echo "✅ Schema sincronizado com sucesso!"
echo ""
echo "💡 Próximos passos:"
echo "   1. Execute: npm run db:seed:production"
echo "   2. Execute: npm run dev:all"
echo "   3. Valide: npm run db:data:validate"
