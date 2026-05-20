#!/bin/bash
set -euo pipefail

DB_NAME="airtrust-db"
MIGRATION_FILE="worker-airtrust/migrations/0062_ssot_extended_tables_triggers_indexes.sql"
LABEL="ssot-0062"

echo "🚀 Aplicando migration SSOT 0062 (tabelas dependentes + triggers + índices)"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Arquivo de migration não encontrado: $MIGRATION_FILE" >&2
  exit 1
fi

echo "🔍 Verificando acesso ao Wrangler..."
if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ Wrangler não instalado. Rode: npm i -D wrangler" >&2
  exit 1
fi

echo "🗄️ Backup pré-migration (remote)"
if wrangler d1 export "$DB_NAME" --remote --output="backups/backup-pre-${LABEL}-$(date +%Y%m%d-%H%M%S).sql"; then
  echo "✅ Backup remoto criado"
else
  echo "⚠️ Falha ao criar backup remoto (prosseguindo mesmo assim)"
fi

echo "🔍 Verificando se migration 0062 já foi aplicada (coluna usuario_id em auditoria)..."
if wrangler d1 execute "$DB_NAME" --remote --command "PRAGMA table_info(auditoria_avancada_v2);" | grep -q "usuario_id"; then
  echo "✅ Migration 0062 já aplicada – pulando execução do arquivo."
else
  echo "📦 Executando migration via arquivo..."
  wrangler d1 execute "$DB_NAME" --remote --file "$MIGRATION_FILE" || {
    echo "❌ Falha ao aplicar migration 0062" >&2
    exit 1
  }
fi

echo "🔎 Validando criação de tabelas e índices principais..."
wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('hospedagens','registros_frms','auditoria_avancada_v2');" | sed 's/^/   /'
wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_funcionarios_%' LIMIT 10;" | sed 's/^/   /'

echo "🧪 Smoke test SELECT em auditoria (últimos 3 registros, se existirem)"
wrangler d1 execute "$DB_NAME" --remote --command "SELECT id, tabela, acao, created_at FROM auditoria_avancada_v2 ORDER BY id DESC LIMIT 3;" | sed 's/^/   /'

echo "✅ Migration SSOT 0062 aplicada com sucesso"
echo "ℹ️ Próximos passos:"
echo "  1. Rodar testes: npm run test -- src/__tests__/funcionarios-ssot-reativo.test.ts"
echo "  2. Validar triggers com UPDATE + soft delete real"
echo "  3. Deploy: npm run deploy:worker (exige token com permissão edit)"
