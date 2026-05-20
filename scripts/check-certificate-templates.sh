#!/bin/bash

# Script para verificar templates de certificados no banco
# Este script testa a query que busca templates

if [ -z "$D1_DB_ID" ] || [ -z "$CLOUDFLARE_AUTH_TOKEN" ]; then
  echo "❌ Variáveis de ambiente não definidas!"
  echo "   Execute: export CLOUDFLARE_AUTH_TOKEN='seu_token'"
  echo "            export D1_DB_ID='seu_db_id'"
  exit 1
fi

echo "🔍 Verificando templates de certificados..."
echo ""

# Query para listar todos os templates ativos
SQL="SELECT id, empresa_id, nome, tipo, padrao, ativo, LENGTH(template_json) as json_length FROM certificados_templates WHERE ativo = 1 AND deleted_at IS NULL ORDER BY empresa_id, padrao DESC;"

echo "📋 SQL Query:"
echo "$SQL"
echo ""

# Executar query via Wrangler (necessário ter credenciais)
echo "📤 Executando query no D1..."

wrangler d1 execute "$D1_DB_ID" --command "$SQL" 2>&1 | head -50

echo ""
echo "✅ Verificação concluída"
