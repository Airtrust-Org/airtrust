#!/usr/bin/env bash
set -euo pipefail

# Seed de registros exemplo na tabela qualificacoes_historico
# Uso:
#   DB=airtrust-db ./worker-airtrust/scripts/seed-historico-sample.sh          # local (wrangler dev)
#   DB=airtrust-db ./worker-airtrust/scripts/seed-historico-sample.sh --remote # produção/staging
# Requer: wrangler >= 3.x e tabela existente.

REMOTE_FLAG=""
if [[ "${1:-}" == "--remote" ]]; then
  REMOTE_FLAG="--remote"
fi

if [[ -z "${DB:-}" ]]; then
  echo "❌ Defina a variável DB com o binding do D1 (ex: DB=airtrust-db)" >&2
  exit 1
fi

echo "🚀 Seed qualificacoes_historico iniciando (DB=$DB REMOTE=${REMOTE_FLAG:---local})"

# Verifica existência da tabela
TABLE_EXISTS=$(npx wrangler d1 execute "$DB" $REMOTE_FLAG --command "SELECT name FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico' LIMIT 1" --json 2>/dev/null | jq -r '.[0].results[0].name // empty')
if [[ -z "$TABLE_EXISTS" ]]; then
  echo "❌ Tabela qualificacoes_historico não encontrada" >&2
  exit 1
fi

# Inserções exemplo (ajuste IDs conforme existentes)
# Pressupõe que exista pelo menos um funcionario (id=1) e um tipo de qualificacao (id=1)
NOW=$(date +%Y-%m-%d' '%H:%M:%S)

SQL="INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, numero_certificado, observacoes, created_at, updated_at, renovada) VALUES 
(1, 1, date('now','-15 days'), date('now','+90 days'), 'CERT-SEED-001', 'Seed automático 1', datetime('now'), datetime('now'), 0),
(1, 1, date('now','-200 days'), date('now','-10 days'), 'CERT-SEED-002', 'Seed automático vencido', datetime('now'), datetime('now'), 0),
(1, 1, date('now','-40 days'), date('now','+5 days'), 'CERT-SEED-003', 'Seed prestes a vencer', datetime('now'), datetime('now'), 0);"

npx wrangler d1 execute "$DB" $REMOTE_FLAG --command "$SQL"

echo "✅ Seed concluído"
