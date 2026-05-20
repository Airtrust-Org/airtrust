#!/bin/bash

echo "🧹 LIMPANDO CONSOLE.LOG DE PRODUÇÃO"
echo "===================================="
echo ""

# Contar console.log antes
before=$(grep -r "console\.log\|console\.debug" src/worker/api --include="*.ts" | grep -v "Logger\." | grep -v "//" | wc -l)
echo "📊 Console.log encontrados: $before"
echo ""

# Remover console.log e console.debug (mas não console.error/warn)
echo "🔧 Removendo console.log e console.debug..."

find src/worker/api -name "*.ts" -type f | while read file; do
  # Remover linhas com console.log (mas não comentadas)
  sed -i '' '/^[^\/]*console\.log(/d' "$file"
  sed -i '' '/^[^\/]*console\.debug(/d' "$file"
done

# Contar depois
after=$(grep -r "console\.log\|console\.debug" src/worker/api --include="*.ts" | grep -v "Logger\." | grep -v "//" | wc -l)

echo ""
echo "✅ Limpeza concluída!"
echo "📊 Antes: $before"
echo "📊 Depois: $after"
echo "📊 Removidos: $((before - after))"
echo ""
echo "⚠️  Console.error e console.warn foram mantidos"
echo "💡 Use Logger.info() ao invés de console.log()"
