#!/bin/bash

echo "🔍 COMPARANDO SISTEMA ATUAL COM VERSÃO CORRETA (SCREENSHOTS)"
echo "══════════════════════════════════════════════════════════════"
echo ""

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# SCREENSHOT 1: Simuladores - Agenda mostra sessões
echo "📸 SCREENSHOT 1: Agenda de Simuladores"
echo "   Esperado: Sessões agendadas visíveis"
AGENDA=$(curl -s "$PROD_URL/api/v2/agendamentos" | jq -r '.data | length')
echo "   Atual: $AGENDA agendamentos encontrados"
if [ "$AGENDA" -gt 0 ]; then
    echo "   ✅ IGUAL às screenshots"
else
    echo "   ❌ DIFERENTE (deveria ter agendamentos)"
fi

echo ""

# SCREENSHOT 2: Manobras - Catálogo com categorias
echo "📸 SCREENSHOT 2: Manobras"
echo "   Esperado: Manobras com códigos CAU-xxx"
MANOBRAS=$(curl -s "$PROD_URL/api/v2/manobras" | jq -r '.data | length')
PRIMEIRA=$(curl -s "$PROD_URL/api/v2/manobras" | jq -r '.data[0].codigo')
echo "   Atual: $MANOBRAS manobras encontradas"
echo "   Primeira manobra: $PRIMEIRA"
if [[ "$PRIMEIRA" == CAU-* ]] || [[ "$PRIMEIRA" == *-* ]]; then
    echo "   ✅ IGUAL às screenshots (tem código correto)"
else
    echo "   ❌ DIFERENTE (código não parece correto)"
fi

echo ""

# SCREENSHOT 3: Funcionários - 20 funcionários
echo "📸 SCREENSHOT 3: Lista de Funcionários"
echo "   Esperado: 20 funcionários"
FUNC=$(curl -s "$PROD_URL/api/v2/funcionarios" | jq -r '.data | length // 0')
echo "   Atual: $FUNC funcionários encontrados"
if [ "$FUNC" -eq 20 ]; then
    echo "   ✅ IGUAL às screenshots (20 funcionários)"
elif [ "$FUNC" -gt 15 ]; then
    echo "   ⚠️  PRÓXIMO (tem $FUNC ao invés de 20)"
else
    echo "   ❌ DIFERENTE (faltam funcionários)"
fi

echo ""

# SCREENSHOT 4: Fichas de Sessão
echo "📸 SCREENSHOT 4: Fichas de Sessão"  
echo "   Esperado: Múltiplas fichas"
FICHAS=$(curl -s "$PROD_URL/api/v2/fichas" | jq -r '.data | length // 0')
echo "   Atual: $FICHAS fichas encontradas"
if [ "$FICHAS" -gt 0 ]; then
    echo "   ✅ TEM FICHAS"
else
    echo "   ❌ SEM FICHAS"
fi

echo ""

# SCREENSHOT 5: Modelos de Sessão
echo "📸 SCREENSHOT 5: Modelos de Sessão"
echo "   Esperado: Modelos ordenados por código"
MODELOS=$(curl -s "$PROD_URL/api/v2/simuladores/modelos" | jq -r '.data | length // 0')
PRIMEIRO=$(curl -s "$PROD_URL/api/v2/simuladores/modelos" | jq -r '.data[0].codigo // empty')
echo "   Atual: $MODELOS modelos encontrados"
echo "   Primeiro modelo: $PRIMEIRO"
if [ "$MODELOS" -gt 0 ]; then
    echo "   ✅ TEM MODELOS"
else
    echo "   ❌ SEM MODELOS"
fi

echo ""

# Funções
echo "📸 SCREENSHOT: Funções"
echo "   Esperado: 6 funções"
FUNCOES=$(curl -s "$PROD_URL/api/v2/funcoes" | jq -r '.data | length // 0')
echo "   Atual: $FUNCOES funções encontradas"
if [ "$FUNCOES" -eq 6 ]; then
    echo "   ✅ IGUAL (6 funções)"
else
    echo "   ⚠️  Quantidade: $FUNCOES"
fi

echo ""

# Qualificações
echo "📸 SCREENSHOT: Qualificações"
QUALS=$(curl -s "$PROD_URL/api/v2/qualificacoes" | jq -r '.data | length // 0')
echo "   Atual: $QUALS qualificações na primeira página"
if [ "$QUALS" -gt 0 ]; then
    echo "   ✅ TEM QUALIFICAÇÕES"
else
    echo "   ❌ SEM QUALIFICAÇÕES"
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
