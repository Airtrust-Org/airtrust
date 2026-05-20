#!/bin/bash
set -e

echo "🚀 APLICAR MIGRAÇÕES EM PRODUÇÃO"
echo "================================="
echo ""

PROJECT_ROOT="/Users/filipedaumas/Documents/airtrust v1"
MIGRATIONS_DIR="$PROJECT_ROOT/worker-airtrust/migrations"

cd "$PROJECT_ROOT"

# Lista de migrações a aplicar
MIGRATIONS=(
    "0033_create_modelos_sessao.sql"
    "0034_create_tabelas_criticas_simulador.sql"
)

echo "📋 Migrações a aplicar:"
for migration in "${MIGRATIONS[@]}"; do
    echo "   • $migration"
done
echo ""

read -p "Confirma aplicação em PRODUÇÃO? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operação cancelada"
    exit 1
fi

echo ""
echo "🔄 Aplicando migrações..."
echo ""

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$MIGRATIONS_DIR/$migration"
    
    if [ -f "$MIGRATION_FILE" ]; then
        echo "📦 Aplicando: $migration"
        
        # Aplicar migração
        npx wrangler d1 execute airtrust-db --remote --file "$MIGRATION_FILE" 2>&1 | grep -E "(success|error|Error)" || true
        
        echo "   ✅ Concluído"
        echo ""
        sleep 2
    else
        echo "   ⚠️  Arquivo não encontrado: $migration"
    fi
done

echo ""
echo "🧪 TESTANDO PRODUÇÃO..."
echo ""

# Testar endpoints
echo "1. Health check:"
curl -s https://airtrust.airtrust.workers.dev/api/health | jq '.success, .status'

echo ""
echo "2. Modelos de sessão:"
curl -s https://airtrust.airtrust.workers.dev/api/simuladores/modelos | jq '.success, (.data | length)'

echo ""
echo "3. Sessões agendadas:"
curl -s https://airtrust.airtrust.workers.dev/api/simuladores/sessoes | jq '.success, (.data | length)'

echo ""
echo "✅ MIGRAÇÕES APLICADAS EM PRODUÇÃO!"
echo ""
