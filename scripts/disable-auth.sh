#!/bin/bash

# Script to disable authentication in all API v2 endpoints
# TODO: Reimplementar autenticação quando v2.2.0 estiver pronto

set -e

SRC_DIR="/Users/filipedaumas/Documents/airtrust/src/worker"

echo "🔓 Iniciando desabilitação de autenticação..."

# Find all TypeScript files in api/v2 and routes that import authMiddleware
FILES=$(find "$SRC_DIR" -name "*.ts" -type f | xargs grep -l "authMiddleware" | grep -E "(api/v2|routes)" | head -30)

echo "Encontrados $(echo $FILES | wc -w) arquivos com authMiddleware"

for FILE in $FILES; do
  echo "→ Processando: $(basename $FILE)"
  
  # Comment out authMiddleware import if present
  sed -i '' 's/^import { authMiddleware/\/\/ TODO: Reimplementar auth\n\/\/ import { authMiddleware/' "$FILE"
  
  # Remove authMiddleware from app.use() calls
  sed -i '' 's/, authMiddleware//g' "$FILE"
  sed -i '' 's/app\.use('\''\/\*'\'', authMiddleware);/\/\/ TODO: authMiddleware removed for dev\n  \/\/ app.use('\''\/\*'\'', authMiddleware);/' "$FILE"
  
  # Remove authMiddleware from route definitions
  sed -i '' 's/, authMiddleware, async/,async/' "$FILE"
  sed -i '' 's/authMiddleware, async (c)/async (c)/' "$FILE"
  
done

echo "✅ Auth desabilitada em todos os arquivos!"
echo ""
echo "Próximos passos:"
echo "1. npm run build"
echo "2. wrangler deploy"
echo "3. Testar: curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes"
