#!/bin/bash

# Query local D1 database to check qualificacoes_tipos schema
# Wrangler stores local D1 dbs in .wrangler/state

WRANGLER_DB=$(find .wrangler -name "*.sqlite" -type f 2>/dev/null | head -1)

if [ -z "$WRANGLER_DB" ]; then
    echo "❌ D1 database not found"
    exit 1
fi

echo "📊 Database: $WRANGLER_DB"
echo ""
echo "📋 Table schema for qualificacoes_tipos:"
sqlite3 "$WRANGLER_DB" "PRAGMA table_info(qualificacoes_tipos);"
echo ""
echo "📊 Row count:"
sqlite3 "$WRANGLER_DB" "SELECT COUNT(*) FROM qualificacoes_tipos;"
echo ""
echo "🔍 Sample rows:"
sqlite3 "$WRANGLER_DB" "SELECT codigo, nome, validade FROM qualificacoes_tipos LIMIT 3;"

