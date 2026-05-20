#!/bin/bash

# Importa dados de produção para local via SQL dumps
set -e

echo "🔄 Importando dados de PRODUÇÃO para LOCAL"
echo "==========================================="
echo ""

cd "$(dirname "$0")/../worker-airtrust" || exit 1

# 1. Exportar sessoes_template
echo "📥 1/3 Exportando sessoes_template..."
npx wrangler d1 execute airtrust-db --remote \
  --command="SELECT id, codigo, nome, descricao, sessao_numero, total_sessoes, tipo, duracao_minutos, ativo, created_at, updated_at FROM sessoes_template WHERE deleted_at IS NULL ORDER BY id" \
  --json > /tmp/sessoes_template.json

# 2. Exportar cadastro_manobras  
echo "📥 2/3 Exportando cadastro_manobras..."
npx wrangler d1 execute airtrust-db --remote \
  --command="SELECT id, tipo_sessao, tipo_aeronave, codigo, descricao, categoria, ordem, obrigatoria FROM cadastro_manobras ORDER BY tipo_sessao, ordem" \
  --json > /tmp/cadastro_manobras.json

# 3. Contar registros
echo ""
echo "📊 Registros exportados:"
SESSOES_COUNT=$(cat /tmp/sessoes_template.json | jq '. | length' 2>/dev/null || echo "?")
MANOBRAS_COUNT=$(cat /tmp/cadastro_manobras.json | jq '. | length' 2>/dev/null || echo "?")
echo "  - Sessões Template: $SESSOES_COUNT"
echo "  - Cadastro Manobras: $MANOBRAS_COUNT"

echo ""
echo "✅ Dados exportados para /tmp/"
echo ""
echo "⚠️  PRÓXIMO PASSO: Converter JSON para SQL e importar no banco local"
echo "    (use o script Python ou manual import)"
echo ""
