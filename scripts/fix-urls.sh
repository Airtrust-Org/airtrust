#!/bin/bash

echo "🔧 CORREÇÃO DE URLs HARDCODED"
echo "======================================"
echo ""

# Backup
echo "📦 Criando backup..."
git add -A
git stash push -m "backup antes de fix-urls $(date +%Y%m%d-%H%M%S)"
echo "   ✅ Backup criado"
echo ""

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
echo "♻️  Execute 'git stash pop' para desfazer se necessário"
