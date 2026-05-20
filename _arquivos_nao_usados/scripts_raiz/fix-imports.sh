#!/bin/bash

# Script para remover imports React não usados

echo "🔧 Corrigindo imports React não usados..."

# Encontrar todos os arquivos .tsx e .ts
find src -type f \( -name "*.tsx" -o -name "*.ts" \) ! -path "*/node_modules/*" ! -path "*/__tests__/*" | while read file; do
  # Verificar se tem "import React," mas não usa React.
  if grep -q "^import React," "$file"; then
    # Substituir "import React, {" por "import {"
    sed -i '' 's/^import React, {/import {/g' "$file"
    # Substituir "import React from 'react';" por nada se não tiver JSX
    if ! grep -q "React\." "$file"; then
      sed -i '' '/^import React from .react.;$/d' "$file"
    fi
    echo "✅ Corrigido: $file"
  fi
done

echo "✅ Imports corrigidos!"
