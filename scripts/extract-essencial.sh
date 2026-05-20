#!/usr/bin/env bash
set -e

cd "/Users/filipedaumas/Documents/airtrust v1"

echo "🚀 Extraindo dados críticos de produção..."

# Tabelas essenciais em ordem de dependência
TABLES=(
  "qualificacoes_categorias"
  "qualificacoes_tipos"
  "funcionarios"
  "qualificacoes_historico"
  "certificados"
)

OUTPUT_SQL="backups/production-essencial.sql"
> "$OUTPUT_SQL"  # Limpar arquivo

# Header
cat >> "$OUTPUT_SQL" << 'SQL'
PRAGMA foreign_keys = OFF;

SQL

# 1. Extrair CREATEs
echo "📋 Extraindo DDL (CREATE TABLE)..."
for TABLE in "${TABLES[@]}"; do
  echo "  - $TABLE"
  cd worker-airtrust
  npx wrangler d1 execute airtrust-db --remote --json --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='$TABLE'" 2>/dev/null | \
    python3 -c "
import json, sys
j = json.load(sys.stdin)
results = j[0].get('results', [])
if results and results[0].get('sql'):
    sql = results[0]['sql'].replace('\"', '')
    sql = sql.replace('\n', ' ')
    sql = sql.replace('  ', ' ')
    print(sql)
" >> "../$OUTPUT_SQL" || echo "-- CRIAR $TABLE MANUALMENTE" >> "../$OUTPUT_SQL"
  echo "" >> "../$OUTPUT_SQL"
  cd ..
done

echo "" >> "$OUTPUT_SQL"

# 2. Extrair INSERTs
echo "📊 Extraindo INSERTs (dados)..."
for TABLE in "${TABLES[@]}"; do
  echo "  - $TABLE"
  cd worker-airtrust
  npx wrangler d1 execute airtrust-db --remote --json --command "SELECT * FROM $TABLE WHERE deleted_at IS NULL LIMIT 10000" 2>/dev/null | \
    python3 << PYTHON
import json, sys, os
try:
  j = json.load(sys.stdin)
  results = j[0].get('results', [])
  if results:
    cols = list(results[0].keys())
    t = '$TABLE'
    print(f"INSERT INTO {t} ({','.join(cols)}) VALUES")
    vals = []
    for r in results:
      row_vals = []
      for c in cols:
        v = r[c]
        if v is None:
          row_vals.append('NULL')
        elif isinstance(v, (int, float)):
          row_vals.append(str(v))
        else:
          row_vals.append("'" + str(v).replace("'", "''") + "'")
      vals.append("(" + ",".join(row_vals) + ")")
    if vals:
      print(",\n".join(vals) + ";")
      print()
except:
  pass
PYTHON >> "../$OUTPUT_SQL" || true
  cd ..
done

# Footer
cat >> "$OUTPUT_SQL" << 'SQL'

PRAGMA foreign_keys = ON;
SQL

echo "✅ Dados extraídos: $OUTPUT_SQL ($(du -h "$OUTPUT_SQL" | cut -f1))"

# 3. Importar
echo ""
echo "📥 Importando no banco local..."
rm -rf worker-airtrust/.wrangler/state/v3/d1
mkdir -p worker-airtrust/.wrangler/state/v3/d1/airtrust-local-fixed.sqlite

cd worker-airtrust
npx wrangler d1 execute airtrust-db --local --file "../$OUTPUT_SQL" 2>&1 | tail -30
cd ..

echo ""
echo "✅ Import concluído!"
