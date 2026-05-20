#!/usr/bin/env bash
set -euo pipefail

DB_NAME="airtrust-db"
REMOTE_FLAG="--remote"
ACTION="list" # list | delete

usage() {
  echo "Uso: $0 [--delete] [--local]"
  echo "  --delete   Remove órfãs após listar"
  echo "  --local    Usa execução local em vez de --remote"
}

for arg in "$@"; do
  case "$arg" in
    --delete) ACTION="delete" ; shift ;;
    --local) REMOTE_FLAG="" ; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $arg"; usage; exit 1 ;;
  esac
done

echo "🔎 Buscando registros órfãos em qualificacoes_historico..."
SQL_LIST="SELECT q.id, q.funcionario_id, q.validade, q.numero_certificado FROM qualificacoes_historico q LEFT JOIN funcionarios f ON f.id = q.funcionario_id WHERE f.id IS NULL AND q.deleted_at IS NULL ORDER BY q.id LIMIT 200;"

wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "$SQL_LIST" || { echo "Falha na listagem"; exit 1; }

if [ "$ACTION" = "delete" ]; then
  echo "⚠️  Removendo órfãs (soft delete)..."
  SQL_DELETE="UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE funcionario_id NOT IN (SELECT id FROM funcionarios) AND deleted_at IS NULL;"
  wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "$SQL_DELETE" || { echo "Falha na remoção"; exit 1; }
  echo "✅ Remoção concluída."
fi

echo "🏁 Concluído."
