#!/bin/bash
set -e

echo "🔨 Importando dados de produção para D1 local..."

# Extrair apenas CREATE TABLE + INSERT (sem PRAGMA, d1_migrations, auditoria)
grep -vE "^(PRAGMA|INSERT INTO \"d1_migrations\"|INSERT INTO \"auditoria\"|INSERT INTO \"system_logs\")" scripts/d1-prod-export.sql > /tmp/d1-clean.sql

echo "📊 Executando import (~4400 linhas)..."
npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file /tmp/d1-clean.sql 2>&1 | tail -20

echo "✅ Import concluído!"
