#!/bin/bash

# Importação a ser adicionada se ainda não estiver presente
IMPORT="import { API_BASE_URL } from '@/react-app/config/api';"

# Encontra todos os arquivos com '/api/v2/ hardcoded
FILES=$(grep -r "'/api/v2/" src/react-app/components --include="*.tsx" --include="*.ts" | grep -v "node_modules" | cut -d: -f1 | sort -u)

for FILE in $FILES; do
  echo "Processing: $FILE"
  
  # Verifica se o arquivo já tem a importação
  if ! grep -q "from '@/react-app/config/api'" "$FILE"; then
    # Adiciona a importação após o primeiro import
    sed -i '' "1,/^import/s/\(^import.*\)/\1\n$IMPORT/" "$FILE"
  fi
  
  # Substitui '/api/v2/ por ${API_BASE_URL}/api/v2/ em fetch calls
  sed -i '' "s|fetch('\/api\/v2\/|fetch(\`\${API_BASE_URL}\/api\/v2\/|g" "$FILE"
  sed -i '' 's|fetch(\`\${API_BASE_URL}/api/v2/|fetch(\`${API_BASE_URL}/api/v2/|g' "$FILE"
  
done

echo "✅ API paths fixed!"
