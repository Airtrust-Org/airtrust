#!/bin/bash

echo "🔍 VERIFICAÇÃO COMPLETA DE BOTÕES EM TODOS OS MÓDULOS"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "📋 1. BUSCANDO BOTÕES DE EDITAR/VISUALIZAR/EXCLUIR"
echo "────────────────────────────────────────────────────────────"

# Buscar todos os arquivos com botões de ação
echo ""
echo "�� Arquivos com onClick e navigate:"
grep -r "onClick.*navigate" src/react-app/pages/ --include="*.tsx" -l | sort

echo ""
echo "🔹 Arquivos com setEditando (modais):"
grep -r "setEditando\|setModalAberto" src/react-app/pages/ --include="*.tsx" -l | sort

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 2. VERIFICANDO MÓDULOS PRINCIPAIS"
echo "────────────────────────────────────────────────────────────"

echo ""
echo "🔹 SIMULADORES - Templates.tsx:"
grep -n "onClick.*navigate\|setModeloEditando" src/react-app/pages/simuladores/Templates.tsx | head -5

echo ""
echo "🔹 FUNCIONÁRIOS - Dashboard/Lista:"
find src/react-app/pages/funcionarios -name "*.tsx" -exec grep -l "onClick.*navigate\|setEditando" {} \;

echo ""
echo "🔹 QUALIFICAÇÕES:"
find src/react-app/pages/qualificacoes -name "*.tsx" -exec grep -l "onClick.*navigate\|setEditando" {} \; 2>/dev/null

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 3. VERIFICANDO ROTAS REGISTRADAS NO APP.TSX"
echo "────────────────────────────────────────────────────────────"

echo ""
echo "🔹 Rotas de edição registradas:"
grep -n "path.*editar" src/react-app/App.tsx | head -10

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ VERIFICAÇÃO CONCLUÍDA"
echo ""
