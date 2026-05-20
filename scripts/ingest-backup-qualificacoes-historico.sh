#!/usr/bin/env bash
set -euo pipefail

DB_FILE="$(pwd)/.wrangler/state/v3/d1/miniflare/DB.sqlite" # adjust if different
SQL_FILE="scripts/ingest-backup-qualificacoes-historico.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ SQL file não encontrado: $SQL_FILE" >&2
  exit 1
fi
if [ ! -f "$DB_FILE" ]; then
  echo "❌ DB sqlite local não encontrado: $DB_FILE" >&2
  exit 1
fi

echo "🔍 Verificando registros atuais em qualificacoes_historico..."
COUNT_BEFORE=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL" 2>/dev/null || echo 0)
echo "   Registros antes: $COUNT_BEFORE"

echo "🚀 Ingest iniciando (se tabela estiver vazia)..."
sqlite3 "$DB_FILE" < "$SQL_FILE" || { echo "❌ Erro ao executar ingest"; exit 1; }

COUNT_AFTER=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL" 2>/dev/null || echo 0)
echo "✅ Registros depois: $COUNT_AFTER"

if [ "$COUNT_BEFORE" -eq 0 ] && [ "$COUNT_AFTER" -gt 0 ]; then
  echo "🎉 Ingest concluído com sucesso."
else
  echo "ℹ️  Nenhuma alteração (tabela já tinha dados ou backup vazio)."
fi
