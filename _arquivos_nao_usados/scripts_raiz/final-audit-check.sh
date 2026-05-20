#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ VERIFICAÇÃO FINAL - Procurando por divergências       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Restaurar log
TOTAL_FILES=$(find src/worker/api/v2 -name "*.ts" -type f | wc -l)
echo "📊 Arquivos TypeScript analisados: $TOTAL_FILES"
echo ""

# Procurar por referências que AINDA podem estar erradas
echo "🔍 Verificações finais:"
echo ""

# 1. Tabelas que NÃO existem
echo "1. Procurando por tabelas que NÃO EXISTEM no banco:"
echo "   ❌ simulador_categorias_manobra:"
grep -r "simulador_categorias_manobra" src/worker/api/v2/ 2>/dev/null | wc -l
echo "   ❌ fichas_sessao (em query):"
grep -r "FROM fichas_sessao\|JOIN fichas_sessao" src/worker/api/v2/ 2>/dev/null | wc -l
echo "   ❌ agendamento_simulador:"
grep -r "FROM agendamento_simulador\|INTO agendamento_simulador" src/worker/api/v2/ 2>/dev/null | wc -l

echo ""
echo "2. Procurando por colunas que NÃO EXISTEM:"
echo "   ❌ .categoria_id em manobras (deveria ser .categoriaid):"
grep -r "m\.categoria_id\|manobra\.categoria_id" src/worker/api/v2/simuladores-consolidado/ 2>/dev/null | wc -l
echo "   ❌ .data_agendamento (deveria ser .data):"
grep -r "\.data_agendamento\|\.data_inicio\|\.data_fim" src/worker/api/v2/ 2>/dev/null | wc -l
echo "   ❌ .e_instrutor (deveria ser .is_instrutor):"
grep -r "\.e_instrutor" src/worker/api/v2/ 2>/dev/null | wc -l

echo ""
echo "✅ RESUMO: Se todos os números acima são 0, está tudo correto!"
echo ""

# Test Health check
echo "🔗 Testando health check..."
curl -s https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/health 2>/dev/null | head -50

