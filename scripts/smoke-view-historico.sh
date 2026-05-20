#!/usr/bin/env bash
set -euo pipefail

# Smoke test for qualificacoes_historico_v view
# Usage: ./scripts/smoke-view-historico.sh [--remote] [--token <JWT>] [--limit <N>]
# Environment: requires wrangler installed and DB name (default: airtrust-db)

DB_NAME=${DB_NAME:-airtrust-db}
REMOTE="--remote"
TOKEN=""
LIMIT=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-remote) REMOTE=""; shift ;;
    --token) TOKEN=$2; shift 2 ;;
    --limit) LIMIT=$2; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "== Smoke: View estrutura (counts) =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT COUNT(*) AS total, SUM(CASE WHEN status_qualificacao='VENCIDA' THEN 1 ELSE 0 END) AS vencidas, SUM(CASE WHEN status_qualificacao='PROXIMA_VENCIMENTO' THEN 1 ELSE 0 END) AS proximas FROM qualificacoes_historico_v;"

echo "== Smoke: Amostras aleatórias =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT id, qualificacao_codigo, funcionario_nome_guerra, data_validade, status_qualificacao, dias_ate_vencimento FROM qualificacoes_historico_v ORDER BY RANDOM() LIMIT $LIMIT;"

echo "== Smoke: Distribuição de status =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT status_qualificacao, COUNT(*) AS qtd FROM qualificacoes_historico_v GROUP BY status_qualificacao ORDER BY qtd DESC;"

if [[ -n "$TOKEN" ]]; then
  echo "== Smoke: Endpoint API (limit=$LIMIT) =="
  curl -s "https://airtrust-api.airtrust.workers.dev/api/qualificacoes/historico?limit=$LIMIT" -H "Authorization: Bearer $TOKEN" | jq '{success, sample: (.data[:$limit])}' --argjson limit $LIMIT
fi

echo "✅ Smoke test concluído"
