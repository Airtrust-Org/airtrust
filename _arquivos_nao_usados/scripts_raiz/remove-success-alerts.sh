#!/bin/bash

# Script para remover alertas de sucesso, mantendo apenas confirmações de exclusão

# Encontrar todos os arquivos TypeScript/TSX
find src/react-app -type f \( -name "*.tsx" -o -name "*.ts" \) | while read file; do
  # Remover linhas com alert de sucesso (mas não de confirmação)
  sed -i '' '/alert.*sucesso/d' "$file"
  sed -i '' '/alert.*salvo/d' "$file"
  sed -i '' '/alert.*criado/d' "$file"
  sed -i '' '/alert.*atualizado/d' "$file"
  sed -i '' '/alert.*criada/d' "$file"
  sed -i '' '/alert.*salva/d' "$file"
  sed -i '' '/alert.*excluído com sucesso/d' "$file"
  sed -i '' '/alert.*excluída com sucesso/d' "$file"
  sed -i '' '/alert.*removido com sucesso/d' "$file"
  sed -i '' '/alert.*removida com sucesso/d' "$file"
  sed -i '' '/alert.*✅/d' "$file"
done

echo "✅ Alertas de sucesso removidos!"
