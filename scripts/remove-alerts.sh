#!/bin/bash

# Script para remover todos os alert() e substituir por toast (sonner)
# Data: 01/12/2025

echo "🔄 Substituindo alert() por toast()..."

# Arquivos a processar
find src/react-app -name "*.tsx" -type f | while read file; do
  # Pular se já tem import do toast
  if ! grep -q "import { toast } from 'sonner'" "$file"; then
    # Verificar se tem alert(
    if grep -q "alert(" "$file"; then
      echo "📝 Processando: $file"
      
      # Adicionar import do toast após outros imports
      if grep -q "^import.*from 'react'" "$file"; then
        sed -i '' "/^import.*from 'react'/a\\
import { toast } from 'sonner';\\
" "$file"
      elif grep -q "^import " "$file"; then
        sed -i '' "1a\\
import { toast } from 'sonner';\\
" "$file"
      fi
    fi
  fi
  
  # Substituir alert( por toast.error( ou toast.success(
  # Sucesso: contém "sucesso", "criado", "atualizado", "salvo", "excluído"
  sed -i '' "s/alert('\([^']*\)\(sucesso\|criado\|atualizado\|salvo\|excluído\|removido\|gerada\|clonado\|aprovada\)\([^']*\)')/toast.success('\1\2\3')/g" "$file"
  sed -i '' 's/alert("\([^"]*\)\(sucesso\|criado\|atualizado\|salvo\|excluído\|removido\|gerada\|clonado\|aprovada\)\([^"]*\)")/toast.success("\1\2\3")/g' "$file"
  sed -i '' 's/alert(`\([^`]*\)\(sucesso\|criado\|atualizado\|salvo\|excluído\|removido\|gerada\|clonado\|aprovada\)\([^`]*\)`)/toast.success(`\1\2\3`)/g' "$file"
  
  # Erro: contém "erro", "falha", "não foi possível"
  sed -i '' "s/alert('\([^']*\)\(Erro\|erro\|Falha\|falha\|não foi\)\([^']*\)')/toast.error('\1\2\3')/g" "$file"
  sed -i '' 's/alert("\([^"]*\)\(Erro\|erro\|Falha\|falha\|não foi\)\([^"]*\)")/toast.error("\1\2\3")/g' "$file"
  sed -i '' 's/alert(`\([^`]*\)\(Erro\|erro\|Falha\|falha\|não foi\)\([^`]*\)`)/toast.error(`\1\2\3`)/g' "$file"
  
  # Warning/Info: outros casos
  sed -i '' "s/alert('\([^']*\)')/toast.warning('\1')/g" "$file"
  sed -i '' 's/alert("\([^"]*\)")/toast.warning("\1")/g' "$file"
  sed -i '' 's/alert(`\([^`]*\)`)/toast.warning(`\1`)/g' "$file"
  
  # Remover ✅ ❌ dos textos (não ficam bem no toast)
  sed -i '' 's/toast\.\(success\|error\|warning\)(.\([✅❌] \)/toast.\1('\''\2/g' "$file"
done

echo "✅ Substituição concluída!"
echo ""
echo "⚠️  IMPORTANTE: Verifique se há erros de compilação e ajuste manualmente se necessário."
