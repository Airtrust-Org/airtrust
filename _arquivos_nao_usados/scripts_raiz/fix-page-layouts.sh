#!/bin/bash
# Script para padronizar layouts de todas as páginas

echo "🎨 Padronizando layouts das páginas..."

# Encontrar todas as páginas que têm divs com padding inconsistente
find src/react-app/pages -type f -name "*.tsx" | while read file; do
  # Substituir padding inconsistente por estrutura padrão
  if grep -q "className=\".*px-" "$file"; then
    echo "  📄 Verificando: $file"
    
    # Remover px-4, px-6, px-8, px-10, px-12 e substituir por estrutura PageLayout
    sed -i '' 's/className="\([^"]*\)px-4\([^"]*\)"/className="\1\2"/g' "$file"
    sed -i '' 's/className="\([^"]*\)px-6\([^"]*\)"/className="\1\2"/g' "$file"
    sed -i '' 's/className="\([^"]*\)px-8\([^"]*\)"/className="\1\2"/g' "$file"
    sed -i '' 's/className="\([^"]*\)px-10\([^"]*\)"/className="\1\2"/g' "$file"
    sed -i '' 's/className="\([^"]*\)px-12\([^"]*\)"/className="\1\2"/g' "$file"
    
    # Remover max-w-7xl que pode causar problemas de largura
    sed -i '' 's/max-w-7xl //g' "$file"
    sed -i '' 's/ max-w-7xl//g' "$file"
    
    # Atualizar classes de container para não ter padding lateral
    sed -i '' 's/className="container mx-auto px-/className="container mx-auto /g' "$file"
  fi
done

echo "✅ Padronização concluída!"
