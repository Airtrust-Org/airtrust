#!/bin/bash

echo "🔧 REMOVENDO @ts-nocheck DE ARQUIVOS CRÍTICOS"
echo "=============================================="
echo ""

# Arquivos críticos para remover @ts-nocheck
CRITICAL_FILES=(
  "src/worker/api/v2/simuladores-consolidado/agendamentos/index.ts"
  "src/worker/api/v2/qualificacoes.ts"
  "src/worker/api/v2/funcionarios.ts"
  "src/worker/api/v2/funcionarios-crud.ts"
  "src/worker/utils/logger.ts"
)

count=0
for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$file" ]; then
    if grep -q "@ts-nocheck" "$file"; then
      echo "✅ Removendo @ts-nocheck de: $file"
      sed -i '' '/@ts-nocheck/d' "$file"
      ((count++))
    else
      echo "⏭️  Já sem @ts-nocheck: $file"
    fi
  else
    echo "⚠️  Arquivo não encontrado: $file"
  fi
done

echo ""
echo "✅ $count arquivos corrigidos"
echo ""
echo "📊 @ts-nocheck restantes:"
grep -r "@ts-nocheck" src --include="*.ts" --include="*.tsx" -l | wc -l
