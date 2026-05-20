#!/bin/bash

# Script para testar os botões do localhost:3000 via curl e screenshot

echo "🧪 TESTE DIRETO DOS BOTÕES - LOCALHOST:3000"
echo "============================================="
echo ""

# Aguardar app carregar
echo "⏳ Aguardando app carregar em http://localhost:3000..."
sleep 3

# Fazer uma requisição para verificar se está rodando
echo "🔍 Verificando se servidor está online..."
curl -s http://localhost:3000/ > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Servidor NÃO está respondendo em http://localhost:3000"
    exit 1
fi
echo "✅ Servidor online"
echo ""

# Baixar o HTML da página de fichas
echo "📥 Baixando HTML de /simuladores..."
FICHAS_HTML=$(curl -s http://localhost:3000/simuladores)

# Verificar se tem a estrutura correta
echo "🔎 Procurando por 'handleAvaliar' no código..."
if echo "$FICHAS_HTML" | grep -q "handleAvaliar"; then
    echo "✅ ENCONTRADO: handleAvaliar está no código!"
else
    echo "❌ NÃO ENCONTRADO: handleAvaliar NÃO está no código!"
    echo "   Isso significa que o arquivo está DESATUALIZADO!"
fi

echo ""
echo "🔎 Procurando por 'handleAssinar' no código..."
if echo "$FICHAS_HTML" | grep -q "handleAssinar"; then
    echo "✅ ENCONTRADO: handleAssinar está no código!"
else
    echo "❌ NÃO ENCONTRADO: handleAssinar NÃO está no código!"
    echo "   Isso significa que o arquivo está DESATUALIZADO!"
fi

echo ""
echo "🔎 Procurando por 'onClick.*navigate.*fichas' (NAVEGAÇÃO ERRADA)..."
if echo "$FICHAS_HTML" | grep -q "onClick.*navigate.*fichas"; then
    echo "❌ ENCONTRADO: Ainda tem navigate para fichas!"
    echo "   Botões estão navigando em vez de abrir modals!"
else
    echo "✅ NÃO ENCONTRADO: Sem navigação errada"
fi

echo ""
echo "🔎 Verificando timestamp do build..."
TIMESTAMP=$(echo "$FICHAS_HTML" | grep -oP '\[DEPLOY_MARKER\].*Build timestamp \K[^<]*' | head -1)
if [ -z "$TIMESTAMP" ]; then
    echo "⚠️  Timestamp não encontrado no HTML"
else
    echo "📦 Timestamp do build: $TIMESTAMP"
fi

echo ""
echo "============================================="
echo "✅ TESTE CONCLUÍDO"
echo "============================================="
