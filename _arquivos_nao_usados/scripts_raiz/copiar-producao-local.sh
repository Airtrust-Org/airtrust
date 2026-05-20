#!/bin/bash
set -e

echo "📦 Copiando dados de PRODUCTION → LOCAL..."

# Tabelas prioritárias
TABLES=(
  "funcionarios"
  "qualificacoes"
  "qualificacoes_historico"
  "certificados"
  "catalogo_treinamentos"
  "sessoes_treinamento"
)

for table in "${TABLES[@]}"; do
  echo "📋 Copiando $table..."
  
  # Exportar de production
  wrangler d1 execute airtrust-db --remote \
    --command="SELECT * FROM $table" \
    --json > /tmp/${table}.json 2>/dev/null || {
    echo "⚠️  Tabela $table não existe em production"
    continue
  }
  
  # Contar registros
  count=$(jq -r '.result[0].results | length' /tmp/${table}.json 2>/dev/null || echo "0")
  echo "✅ $count registros exportados de $table"
  
  if [ "$count" -eq "0" ]; then
    continue
  fi
  
  # Gerar INSERTs
  jq -r '.result[0].results[] | to_entries | map("\"\(.value)\"") | join(",")' \
    /tmp/${table}.json > /tmp/${table}_values.txt 2>/dev/null || {
    echo "⚠️  Erro ao processar $table"
    continue
  }
  
  # Aplicar no local (primeiro registro apenas como teste)
  echo "🔧 Inserindo em local..."
  head -1 /tmp/${table}_values.txt | while read values; do
    wrangler d1 execute airtrust-db --local \
      --command="INSERT OR IGNORE INTO $table VALUES ($values)" 2>&1 | grep -q "success" && echo "✓" || echo "✗"
  done
done

echo "✅ Cópia concluída!"
