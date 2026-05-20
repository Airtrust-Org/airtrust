#!/bin/bash

echo "🔍 AUDITORIA FINAL - Procurando por diverg ências de schema"
echo ""

# Procurar por LEFT JOIN com nomes que podem estar errados
echo "❌ Procurando por JOINs a tabelas que NÃO EXISTEM:"
grep -rn "LEFT JOIN\|INNER JOIN" src/worker/api/v2/ 2>/dev/null | grep -i "simulador_categoria\|fichas_sessao\|simulador_agendament\|agendamentos[^_]" | head -10

echo ""
echo "🔎 Procurando por referências a colunas com underscore errados:"
grep -rn "\.resultado\|\.nota_final\|\.data_agendamento\|\.data_inicio\|\.data_fim" src/worker/api/v2/ 2>/dev/null | head -10

echo ""
echo "✅ Procurando por nomes de UPDATE/INSERT com colunas erradas:"
grep -rn "UPDATE.*SET\|INSERT INTO" src/worker/api/v2/ 2>/dev/null | grep -i "resultado\|nota_final" | head -10

