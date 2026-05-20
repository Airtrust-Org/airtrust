#!/usr/bin/env bash
set -euo pipefail

# diagnostico-qualificacoes.sh
# Uso: ./worker-airtrust/scripts/diagnostico-qualificacoes.sh [DB_NAME]
# Executa diagnóstico de diversidade e presença de backup para qualificacoes_historico.
# Requer wrangler autenticado (OAuth ou API Token com permissões D1 + User Details Read).
# Se falhar por auth, aborta rapidamente.

DB_NAME=${1:-"airtrust-db"}

function run() {
  local sql="$1"
  wrangler d1 execute "$DB_NAME" --remote --command "$sql" || { echo "[ERRO] Falha executando SQL" >&2; exit 1; }
}

echo "== Checando diversidade atual =="
run "SELECT COUNT(*) AS total, COUNT(DISTINCT tipo_codigo) AS tipos, COUNT(DISTINCT codigo) AS codigos, COUNT(DISTINCT categoria) AS categorias FROM qualificacoes_historico WHERE deleted_at IS NULL;"

echo "== Amostra atual =="
run "SELECT id, tipo_codigo, codigo, categoria, qualificacao_id FROM qualificacoes_historico WHERE deleted_at IS NULL LIMIT 15;"

echo "== Verifica existência backup =="
run "SELECT name FROM sqlite_master WHERE type='table' AND name='_backup_qualificacoes_historico';"

echo "== Diversidade backup =="
run "SELECT COUNT(*) AS total_bkp, COUNT(DISTINCT tipo_codigo) AS tipos_bkp, COUNT(DISTINCT codigo) AS codigos_bkp, COUNT(DISTINCT categoria) AS categorias_bkp FROM _backup_qualificacoes_historico;"

echo "== Amostra backup =="
run "SELECT id, tipo_codigo, codigo, categoria FROM _backup_qualificacoes_historico LIMIT 15;"

echo "== Possíveis tipos atuais (agrupados) =="
run "SELECT COALESCE(tipo_codigo,codigo) AS chave, COUNT(*) AS total FROM qualificacoes_historico WHERE deleted_at IS NULL GROUP BY chave ORDER BY total DESC LIMIT 20;"

echo "== Concluído diagnóstico. Se diversidade baixa e backup diverso, aplicar migration 0091. =="
