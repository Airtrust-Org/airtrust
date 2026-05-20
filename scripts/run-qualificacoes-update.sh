#!/bin/bash
# =================================================================
# Script para executar todas as atualizações de qualificações
# Executa as partes 7, 8 e 9 em ordem no banco de produção
# Data: 2025-12-05
# =================================================================

set -e

echo "🚀 Iniciando atualização de qualificações..."
echo ""

cd worker-airtrust

echo "📦 Parte 7: G1, G2, H, CHTIFR, IFR..."
npx wrangler d1 execute airtrust-db --remote --file=../scripts/update-qualificacoes-parte7.sql
echo "✅ Parte 7 concluída!"
echo ""

echo "📦 Parte 8: LOFT, NOT, OFEXCRED, OPC..."
npx wrangler d1 execute airtrust-db --remote --file=../scripts/update-qualificacoes-parte8.sql
echo "✅ Parte 8 concluída!"
echo ""

echo "📦 Parte 9: ASO.P, SAEFAP06, SAEFAP14, TIPO..."
npx wrangler d1 execute airtrust-db --remote --file=../scripts/update-qualificacoes-parte9.sql
echo "✅ Parte 9 concluída!"
echo ""

echo "🎉 Todas as atualizações de qualificações foram concluídas com sucesso!"
