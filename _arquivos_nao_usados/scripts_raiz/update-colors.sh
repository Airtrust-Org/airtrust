#!/bin/bash
# Script para atualizar cores do design system antigo para novo

echo "🎨 Atualizando cores para o novo Design System..."

# Contador
count=0

# Encontrar todos os arquivos .tsx e .ts
find src/react-app -type f \( -name "*.tsx" -o -name "*.ts" \) | while read file; do
  # Verificar se o arquivo contém alguma das cores antigas
  if grep -q "bg-blue-600\|text-blue-600\|hover:bg-blue-700\|hover:text-blue-800\|bg-blue-50\|text-blue-800\|bg-blue-100\|bg-blue-400" "$file"; then
    echo "  ✏️  Atualizando: $file"
    
    # Substituir cores blue-600 por primary
    sed -i '' 's/bg-blue-600/bg-primary/g' "$file"
    sed -i '' 's/text-blue-600/text-primary/g' "$file"
    
    # Substituir hovers
    sed -i '' 's/hover:bg-blue-700/hover:bg-primary\/90/g' "$file"
    sed -i '' 's/hover:text-blue-800/hover:text-primary/g' "$file"
    
    # Substituir variantes claras
    sed -i '' 's/bg-blue-50/bg-primary\/10/g' "$file"
    sed -i '' 's/bg-blue-100/bg-primary\/20/g' "$file"
    sed -i '' 's/text-blue-800/text-primary/g' "$file"
    
    # Substituir disabled
    sed -i '' 's/disabled:bg-blue-400/disabled:bg-primary\/50/g' "$file"
    
    # Substituir border e focus
    sed -i '' 's/border-blue-600/border-primary/g' "$file"
    sed -i '' 's/border-blue-500/border-primary/g' "$file"
    sed -i '' 's/focus:ring-blue-500/focus:ring-primary/g' "$file"
    
    ((count++))
  fi
done

echo "✅ Concluído! $count arquivos atualizados."
