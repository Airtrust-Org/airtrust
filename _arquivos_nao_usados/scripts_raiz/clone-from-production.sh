#!/bin/bash
set -e

echo "🔄 CLONANDO BANCO DE PRODUÇÃO → LOCAL"
echo "======================================"
echo ""

PROD_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
PROD_DB_NAME="airtrust-db"
LOCAL_DB_NAME="airtrust-db-dev"

echo "📊 Database ID: $PROD_DB_ID"
echo "📊 Database Name: $PROD_DB_NAME"
echo ""

# Create export directory
mkdir -p migrations/prod-clone
EXPORT_DIR="migrations/prod-clone"

echo "🔍 ETAPA 1: Listando tabelas de produção..."
echo ""

# Get list of all tables
npx wrangler d1 execute $PROD_DB_NAME --remote \
  --command ".tables" > "$EXPORT_DIR/tables_list.txt" 2>&1

echo "✅ Listagem salva em: $EXPORT_DIR/tables_list.txt"
echo ""

echo "📥 ETAPA 2: Exportando schema completo de produção..."
echo ""

# Export full schema
npx wrangler d1 execute $PROD_DB_NAME --remote \
  --command ".schema" > "$EXPORT_DIR/schema.sql" 2>&1

echo "✅ Schema exportado: $EXPORT_DIR/schema.sql"
echo ""

echo "📤 ETAPA 3: Exportando dados de produção..."
echo ""

# Tables to export (priority order)
TABLES=(
  "usuarios"
  "funcoes"
  "setores"
  "aeronaves"
  "funcionarios"
  "qualificacoes"
  "simuladores"
  "treinamentos"
  "sessoes"
  "manobras"
  "fichas_sessao"
  "empresas"
)

# Export each table
for TABLE in "${TABLES[@]}"; do
  echo "  📦 Exportando: $TABLE"
  
  # Get table data as SQL inserts
  npx wrangler d1 execute $PROD_DB_NAME --remote \
    --command "SELECT * FROM $TABLE" --json > "$EXPORT_DIR/${TABLE}_data.json" 2>/dev/null || {
      echo "    ⚠️  Tabela não encontrada ou vazia"
      continue
    }
  
  # Convert JSON to SQL INSERT statements using Python
  python3 - <<PYTHON_SCRIPT
import json
import sys

try:
    with open("$EXPORT_DIR/${TABLE}_data.json", 'r') as f:
        data = json.load(f)
    
    if not data or len(data) == 0:
        print("    ℹ️  Nenhum dado")
        sys.exit(0)
    
    # Get first result set
    results = data[0].get('results', [])
    
    if not results:
        print("    ℹ️  Tabela vazia")
        sys.exit(0)
    
    with open("$EXPORT_DIR/${TABLE}_inserts.sql", 'w') as out:
        for row in results:
            columns = list(row.keys())
            values = []
            for col in columns:
                val = row[col]
                if val is None:
                    values.append('NULL')
                elif isinstance(val, (int, float)):
                    values.append(str(val))
                else:
                    # Escape single quotes
                    escaped = str(val).replace("'", "''")
                    values.append(f"'{escaped}'")
            
            cols_str = ', '.join([f'"{c}"' for c in columns])
            vals_str = ', '.join(values)
            out.write(f'INSERT INTO "{TABLE}" ({cols_str}) VALUES ({vals_str});\n')
    
    print(f"    ✅ {len(results)} registros exportados")
except Exception as e:
    print(f"    ❌ Erro: {str(e)[:100]}")
PYTHON_SCRIPT

done

echo ""
echo "📥 ETAPA 4: Aplicando schema no banco local..."
echo ""

# Apply schema to local database
npx wrangler d1 execute $LOCAL_DB_NAME \
  --config wrangler.dev.toml \
  --local \
  --file "$EXPORT_DIR/schema.sql" 2>&1 | tail -10

echo "✅ Schema aplicado localmente"
echo ""

echo "📥 ETAPA 5: Importando dados no banco local..."
echo ""

# Import data for each table
for TABLE in "${TABLES[@]}"; do
  if [ -f "$EXPORT_DIR/${TABLE}_inserts.sql" ]; then
    echo "  📦 Importando: $TABLE"
    
    npx wrangler d1 execute $LOCAL_DB_NAME \
      --config wrangler.dev.toml \
      --local \
      --file "$EXPORT_DIR/${TABLE}_inserts.sql" 2>&1 | grep -v "wrangler\|─\|Resource\|Executing" || true
    
    echo "    ✅ Dados importados"
  fi
done

echo ""
echo "🔍 ETAPA 6: Verificando dados importados..."
echo ""

for TABLE in "funcionarios" "qualificacoes" "usuarios"; do
  COUNT=$(npx wrangler d1 execute $LOCAL_DB_NAME \
    --config wrangler.dev.toml \
    --local \
    --command "SELECT COUNT(*) as total FROM $TABLE" 2>&1 | \
    grep -o '"total":[0-9]*' | sed 's/"total"://' || echo "0")
  
  echo "  ✅ $TABLE: $COUNT registros"
done

echo ""
echo "✅ CLONAGEM COMPLETA!"
echo ""
echo "🚀 Para testar:"
echo "   Terminal 1: npm run dev:worker"
echo "   Terminal 2: npm run dev"
echo "   Acesse: http://localhost:3000"
echo ""
