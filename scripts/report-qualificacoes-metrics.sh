#!/usr/bin/env bash
set -euo pipefail
DB_BINDING="DB" # binding correto

echo "📊 Métricas qualificações"
wrangler d1 execute "$DB_BINDING" --command "SELECT COUNT(*) AS total FROM qualificacoes_historico;"
wrangler d1 execute "$DB_BINDING" --command "SELECT COUNT(*) AS mapped FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL;"
wrangler d1 execute "$DB_BINDING" --command "SELECT COUNT(*) AS unmapped FROM qualificacoes_historico WHERE qualificacao_id IS NULL;"
wrangler d1 execute "$DB_BINDING" --command "SELECT ROUND( (SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL)*100.0 / NULLIF((SELECT COUNT(*) FROM qualificacoes_historico),0),2) AS mapping_percent;"

echo "🔎 Top 10 categorias genéricas (mapeadas)"
wrangler d1 execute "$DB_BINDING" --command "SELECT qt.categoria, COUNT(*) AS cnt FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id WHERE qh.deleted_at IS NULL GROUP BY qt.categoria ORDER BY cnt DESC LIMIT 10;"

echo "🟡 Exemplo registros ainda não mapeados (até 5)"
wrangler d1 execute "$DB_BINDING" --command "SELECT id, funcionario_id, categoria FROM qualificacoes_historico WHERE qualificacao_id IS NULL AND deleted_at IS NULL LIMIT 5;"