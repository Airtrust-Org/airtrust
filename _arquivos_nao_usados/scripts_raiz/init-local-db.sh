#!/bin/bash

echo "🚀 Inicializando banco de dados local..."

# Aplicar schema completo
echo "📄 Aplicando schema..."
npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file migrations-prod/0001_schema_completo.sql

# Aplicar seed data se existir
if [ -f "migrations/2099_seed_data.sql" ]; then
  echo "🌱 Aplicando seed data..."
  npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file migrations/2099_seed_data.sql
fi

# Criar usuário admin
if [ -f "scripts/seed-admin.sql" ]; then
  echo "👤 Criando usuário admin..."
  npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file scripts/seed-admin.sql
fi

echo "✅ Banco de dados local inicializado!"
echo "🔗 Acesse: http://localhost:3000"
