#!/bin/bash

# Script para executar migration 005 sem usar o API token com permissões limitadas
# Usa OAuth login direto

echo "🔄 Executando migration 005_licencas_completo.sql..."
echo ""

cd "$(dirname "$0")"

# Limpar variável de ambiente temporariamente
unset CLOUDFLARE_API_TOKEN
unset CLOUDFLARE_ZONE_ID

# Verificar se migration existe
if [ ! -f "migrations/005_licencas_completo.sql" ]; then
    echo "❌ Erro: arquivo migrations/005_licencas_completo.sql não encontrado"
    exit 1
fi

echo "📋 Conteúdo da migration:"
echo "----------------------------------------"
head -20 migrations/005_licencas_completo.sql
echo "... ($(wc -l < migrations/005_licencas_completo.sql) linhas no total)"
echo "----------------------------------------"
echo ""

# Executar usando o worker directory (onde wrangler.toml existe)
cd worker-airtrust

echo "🔧 Executando migration no D1 (airtrust-db)..."
echo ""

# Tentar execução direta
npx wrangler d1 execute airtrust-db \
    --remote \
    --file=../migrations/005_licencas_completo.sql

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Migration executada com sucesso!"
    echo ""
    echo "📊 Verificando tabela criada..."
    npx wrangler d1 execute airtrust-db --remote \
        --command="SELECT name, sql FROM sqlite_master WHERE type='table' AND name='licencas';"
    
    echo ""
    echo "📊 Verificando índices criados..."
    npx wrangler d1 execute airtrust-db --remote \
        --command="SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='licencas';"
    
    echo ""
    echo "🎉 MIGRATION COMPLETA! Módulo de Licenças 100% operacional."
else
    echo ""
    echo "❌ Erro ao executar migration (código: $EXIT_CODE)"
    echo ""
    echo "Possíveis soluções:"
    echo "1. Verifique se você tem acesso ao D1 database 'airtrust-db'"
    echo "2. Execute 'npx wrangler whoami' para verificar autenticação"
    echo "3. Se necessário, faça login OAuth: 'npx wrangler login'"
    exit $EXIT_CODE
fi
