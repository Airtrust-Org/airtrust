#!/bin/bash

# Script Simplificado de Auditoria - Componentes de Simuladores

MODULE="simuladores"
COMPONENT_DIR="src/react-app/components/$MODULE"

echo "🔍 Auditando componentes de: $MODULE"
echo ""

for file in "$COMPONENT_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    COMPONENT_NAME=$(basename "$file" .tsx)
    
    # Contar imports
    COUNT=$(grep -r "import.*$COMPONENT_NAME\|from.*$COMPONENT_NAME" src/react-app \
      --include="*.tsx" \
      --include="*.ts" 2>/dev/null | grep -v "^$file:" | wc -l | xargs)
    
    if [ "$COUNT" = "0" ]; then
      echo "❌ $COMPONENT_NAME (não usado)"
    else
      echo "✅ $COMPONENT_NAME ($COUNT usos)"
    fi
  fi
done

echo ""
echo "✅ Análise completa!"
