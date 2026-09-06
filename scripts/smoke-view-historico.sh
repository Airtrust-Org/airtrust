#!/usr/bin/env bash
set -euo pipefail

# Smoke test for qualificacoes_historico_v view
# Usage: ./scripts/smoke-view-historico.sh [--remote] [--token <JWT>] [--limit <N>]
# Environment: requires wrangler installed and DB name (default: airtrust-db)

DB_NAME=${DB_NAME:-airtrust-db}
REMOTE=""
TOKEN=""
LIMIT=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-remote) REMOTE=""; shift ;;
    --remote)
      [[ "${AIRTRUST_ALLOW_NONPROD_REMOTE_VALIDATION:-}" == "AIRTRUST_NONPROD_ONLY" ]] || {
        echo "Remote validation requires AIRTRUST_ALLOW_NONPROD_REMOTE_VALIDATION=AIRTRUST_NONPROD_ONLY" >&2
        exit 2
      }
      REMOTE="--remote"; shift ;;
    --token) TOKEN=$2; shift 2 ;;
    --limit) LIMIT=$2; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "== Smoke: View estrutura (counts) =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT COUNT(*) AS total, SUM(CASE WHEN status_qualificacao='VENCIDA' THEN 1 ELSE 0 END) AS vencidas, SUM(CASE WHEN status_qualificacao='PROXIMA_VENCIMENTO' THEN 1 ELSE 0 END) AS proximas FROM qualificacoes_historico_v;"

echo "== Smoke: Cobertura agregada por código =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT COALESCE(qualificacao_codigo,'UNKNOWN') AS qualificacao_codigo, COUNT(*) AS qtd FROM qualificacoes_historico_v GROUP BY COALESCE(qualificacao_codigo,'UNKNOWN') ORDER BY qtd DESC LIMIT $LIMIT;"

echo "== Smoke: Distribuição de status =="
wrangler d1 execute "$DB_NAME" $REMOTE --command "SELECT status_qualificacao, COUNT(*) AS qtd FROM qualificacoes_historico_v GROUP BY status_qualificacao ORDER BY qtd DESC;"

if [[ -n "$TOKEN" ]]; then
  echo "== Smoke: Endpoint API (limit=$LIMIT) =="
  [[ -n "${AIRTRUST_API_BASE_URL:-}" ]] || { echo "AIRTRUST_API_BASE_URL is required when --token is used" >&2; exit 2; }
case "$AIRTRUST_API_BASE_URL" in
  *://api.airtrust.online*|*://airtrust-api.airtrust.workers.dev*) echo "Production API is not allowed by this legacy smoke" >&2; exit 2 ;;
esac
curl -s "${AIRTRUST_API_BASE_URL%/}/api/qualificacoes/historico?limit=$LIMIT" -H "Authorization: Bearer $TOKEN" | jq '{success, count: (.data | length)}'
fi

echo "✅ Smoke test concluído"
