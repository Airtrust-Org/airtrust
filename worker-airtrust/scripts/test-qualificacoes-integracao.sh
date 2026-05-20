#!/usr/bin/env bash
set -euo pipefail

# Script de teste de integração da tabela qualificacoes_historico (view removida)
# Uso: DB_NAME=airtrust-db ./scripts/test-qualificacoes-integracao.sh
# Requer: wrangler >= 3.x com binding D1 configurado

: "${DB_NAME:=airtrust-db}" # permite override externo

if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ wrangler não encontrado no PATH" >&2
  exit 1
fi

REMOTE_FLAG=""
if [ "${REMOTE:=0}" = "1" ]; then
  REMOTE_FLAG="--remote"
fi

echo "🔬 Iniciando testes de integração da tabela qualificacoes_historico (DB: $DB_NAME) REMOTE=${REMOTE:=0}";

run_sql() {
  local sql="$1"
  wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "$sql" --json 2>/dev/null | jq -r '.[0].results'
}

"# 1. Tabela existe?" >/dev/null
TABLE_CHECK=$(run_sql "SELECT name FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico';")
if [[ -z "$TABLE_CHECK" ]]; then
  echo "❌ Tabela qualificacoes_historico não encontrada"; exit 1
else
  echo "✅ Tabela encontrada"
fi

# 2. Contagem
TOTAL_BASE=$(run_sql "SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE deleted_at IS NULL;")
echo "→ Total (base): $TOTAL_BASE"

# 3. Top 5 proximas a vencer (tabela)
echo "→ Top 5 mais próximas do vencimento (dias_ate_vencimento ASC)"
run_sql "SELECT qh.id, qh.funcionario_id, qt.nome AS qualificacao_nome, CAST(julianday(qh.data_vencimento) - julianday('now') AS INT) AS dias_ate_vencimento
         FROM qualificacoes_historico qh
         LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
         WHERE qh.deleted_at IS NULL AND qh.data_vencimento IS NOT NULL
         ORDER BY dias_ate_vencimento ASC
         LIMIT 5;" | jq -r '.[] | "#"'

# 4. Distribuição por status (tabela)
echo "→ Distribuição por status"
run_sql "SELECT status, COUNT(*) AS total FROM qualificacoes_historico WHERE deleted_at IS NULL GROUP BY status ORDER BY total DESC;" | jq -r '.[] | "#"'

# 5. Sanidade campos críticos nulos
NULOS=$(run_sql "SELECT COUNT(*) AS total FROM qualificacoes_historico qh
                 LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
                 LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
                 WHERE qh.deleted_at IS NULL AND (qh.codigo IS NULL OR f.nome IS NULL OR qt.nome IS NULL);")
echo "→ Registros com campos críticos nulos: $NULOS"
if [[ "$NULOS" != "0" ]]; then
  echo "⚠️  Existem registros com dados normalizados ausentes"
else
  echo "✅ Nenhum registro com dados normalizados ausentes"
fi

echo "🎯 Testes de integração concluídos"
