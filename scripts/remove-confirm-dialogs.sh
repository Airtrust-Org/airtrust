#!/usr/bin/env bash
set -euo pipefail

echo "🔧 REMOVENDO CONFIRMAÇÕES NATIVAS (confirm)"
echo "======================================"
echo ""

if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working tree suja. Este script altera arquivos em massa."
    echo "   Faça backup/stage seletivo manualmente e rode novamente em uma árvore limpa."
    exit 1
fi

# Encontrar arquivos com confirm
echo "🔍 Procurando confirm()..."
FILES=$(grep -rl "if.*confirm(" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null)

COUNT=0
for file in $FILES; do
    echo "   📝 Processando: $file"
    
    # Remover a verificação if (!confirm(...)) return;
    # Padrão 1: if (!confirm('...')) return;
    sed -i '' '/if[[:space:]]*([[:space:]]*!confirm(/,/return;/d' "$file"
    
    # Padrão 2: if (confirm('...')) { ... }
    # Este é mais complexo, vamos apenas remover a condição
    sed -i '' 's/if[[:space:]]*([[:space:]]*confirm([^)]*)[[:space:]]*)[[:space:]]*{//g' "$file"
    sed -i '' 's/if[[:space:]]*([[:space:]]*!confirm([^)]*)[[:space:]]*)[[:space:]]*{/\/\/ Confirmação removida\n      {/g' "$file"
    
    COUNT=$((COUNT + 1))
done

echo ""
echo "======================================"
echo "✅ $COUNT arquivo(s) processado(s)"
echo ""
echo "🔍 Execute 'git diff' para ver as mudanças"
echo "♻️  Use git diff e reverta seletivamente se necessário"
