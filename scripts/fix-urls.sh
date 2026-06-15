#!/usr/bin/env bash
set -euo pipefail

echo "🔧 CORREÇÃO DE URLs HARDCODED"
echo "======================================"
echo ""

if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working tree suja. Este script altera arquivos em massa."
    echo "   Faça backup/stage seletivo manualmente e rode novamente em uma árvore limpa."
    exit 1
fi

# Encontrar e listar arquivos
echo "🔍 Procurando URLs hardcoded..."
FILES=$(grep -rl "localhost:8787" src --include="*.tsx" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "node_modules")

COUNT=0
for file in $FILES; do
    # Pular arquivos com @ts-nocheck
    if head -1 "$file" | grep -q "@ts-nocheck"; then
        continue
    fi
    
    # Pular comentários
    if grep "localhost:8787" "$file" | grep -q "^[[:space:]]*//"; then
        continue
    fi
    
    # Pular allowedOrigins
    if grep "localhost:8787" "$file" | grep -q "allowedOrigins"; then
        continue
    fi
    
    echo "   📝 Corrigindo: $file"
    
    # Substituir padrões comuns
    sed -i '' "s|'http://localhost:8787'|window.location.origin|g" "$file"
    sed -i '' 's|"http://localhost:8787"|window.location.origin|g' "$file"
    sed -i '' 's|`http://localhost:8787`|window.location.origin|g' "$file"
    
    # Padrões com template literals
    sed -i '' 's|`http://localhost:8787/\([^`]*\)`|`${window.location.origin}/\1`|g' "$file"
    
    COUNT=$((COUNT + 1))
done

echo ""
echo "======================================"
echo "✅ $COUNT arquivo(s) corrigido(s)"
echo ""
echo "🔍 Execute 'npm run validate' para verificar"
echo "📝 Execute 'git diff' para ver as mudanças"
echo "♻️  Use git diff e reverta seletivamente se necessário"
