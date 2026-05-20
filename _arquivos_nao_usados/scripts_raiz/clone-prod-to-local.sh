#!/bin/bash
set -e

echo "🧹 LIMPANDO BANCO LOCAL E CLONANDO DE PRODUÇÃO"
echo "=============================================="
echo ""

DB_PATH=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
DB_FILE="$DB_PATH/cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"

# Step 1: Stop any running wrangler dev
echo "🛑 Parando worker local (se estiver rodando)..."
pkill -f "wrangler dev" || true
sleep 2

# Step 2: Delete local database
echo "🗑️  Removendo banco local..."
rm -f "$DB_FILE" "$DB_FILE-shm" "$DB_FILE-wal"
echo "✅ Banco local removido"
echo ""

# Step 3: Apply production schema
echo "📋 Aplicando schema de produção..."
if [ -f "migrations-prod/0001_schema_completo.sql" ]; then
    npx wrangler d1 execute airtrust-db-dev \
        --config wrangler.dev.toml \
        --local \
        --file migrations-prod/0001_schema_completo.sql 2>&1 | tail -20
    echo "✅ Schema aplicado"
else
    echo "⚠️  Schema de produção não encontrado, usando schema alternativo..."
    npx wrangler d1 execute airtrust-db-dev \
        --config wrangler.dev.toml \
        --local \
        --file migrations/2024_sistema_definitivo.sql 2>&1 | tail -20
fi
echo ""

# Step 4: Extract and apply INSERTs from dump
echo "📥 Extraindo dados do dump de produção..."
DUMP_FILE="migrations/data-export/prod_clean.sql"

if [ -f "$DUMP_FILE" ]; then
    # Extract only INSERT statements for main tables
    echo "  Extraindo INSERTs..."
    
    # Tables prioritárias
    TABLES=(
        "funcionarios"
        "qualificacoes"
        "empresas"
        "usuarios"
        "funcoes"
        "setores"
        "aeronaves"
        "simuladores"
        "treinamentos"
        "sessoes"
        "manobras"
        "fichas_sessao"
    )
    
    for table in "${TABLES[@]}"; do
        echo "    Processando: $table"
        grep "INSERT INTO \"$table\"" "$DUMP_FILE" > "/tmp/${table}_inserts.sql" 2>/dev/null || true
        
        if [ -f "/tmp/${table}_inserts.sql" ] && [ -s "/tmp/${table}_inserts.sql" ]; then
            TOTAL=$(wc -l < "/tmp/${table}_inserts.sql")
            echo "      → $TOTAL registros encontrados"
            
            # Apply inserts
            npx wrangler d1 execute airtrust-db-dev \
                --config wrangler.dev.toml \
                --local \
                --file "/tmp/${table}_inserts.sql" 2>&1 | grep -v "wrangler\|─\|Resource\|Executing" || true
            
            echo "      ✅ Dados importados"
        else
            echo "      ℹ️  Nenhum dado encontrado"
        fi
    done
else
    echo "⚠️  Dump de produção não encontrado: $DUMP_FILE"
fi

echo ""
echo "🔍 VERIFICANDO DADOS IMPORTADOS"
echo "================================"
echo ""

# Verify data
for table in "funcionarios" "qualificacoes" "empresas" "usuarios"; do
    echo -n "  $table: "
    npx wrangler d1 execute airtrust-db-dev \
        --config wrangler.dev.toml \
        --local \
        --command "SELECT COUNT(*) as total FROM $table WHERE deleted_at IS NULL" 2>&1 | \
        grep -o '"total":[0-9]*' | sed 's/"total"://' || echo "0"
done

echo ""
echo "✅ CLONAGEM COMPLETA!"
echo ""
echo "🚀 Para testar, execute:"
echo "   npm run dev:worker  (em um terminal)"
echo "   npm run dev         (em outro terminal)"
echo "   Acesse: http://localhost:3000"
