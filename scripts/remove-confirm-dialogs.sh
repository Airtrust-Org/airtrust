#!/bin/bash

echo "🔧 REMOVENDO CONFIRMAÇÕES NATIVAS (confirm)"
echo "======================================"
echo ""

# Backup
echo "📦 Criando backup..."
git add -A
git stash push -m "backup antes de remover confirms $(date +%Y%m%d-%H%M%S)"
echo "   ✅ Backup criado"
echo ""

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
echo "♻️  Execute 'git stash pop' para desfazer se necessário"
