#!/usr/bin/env bash
set -euo pipefail

DB="airtrust-db"
echo "🚀 Iniciando criação de staging de enriquecimento de qualificações"

run() {
  local label="$1"; shift
  local sql="$1"
  echo "→ $label"
  wrangler d1 execute "$DB" --remote --command "$sql" || { echo "❌ Falhou: $label"; exit 1; }
}

echo "🧼 Remover staging anterior (se existir)"
run "Drop staging" "DROP TABLE IF EXISTS _qualificacoes_enriquecimento;"

echo "🛠️ Criar staging"
run "Create staging" "CREATE TABLE _qualificacoes_enriquecimento (historico_id INTEGER PRIMARY KEY, categoria TEXT, validade TEXT, numero_certificado TEXT, orgao_emissor TEXT, sugestao_codigo TEXT, sugestao_nome TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')));"

echo "📥 Inserir registros não mapeados"
run "Populate staging" "INSERT INTO _qualificacoes_enriquecimento (historico_id,categoria,validade,numero_certificado,orgao_emissor) SELECT id,categoria,validade,numero_certificado,orgao_emissor FROM qualificacoes_historico WHERE deleted_at IS NULL AND qualificacao_id IS NULL;"

echo "🔎 Gerar sugestões iniciais (heurística categoria única)"
run "Sugestoes categoria" "UPDATE _qualificacoes_enriquecimento SET sugestao_codigo=(SELECT qt.codigo FROM qualificacoes_tipos qt WHERE qt.deleted_at IS NULL AND qt.categoria=_qualificacoes_enriquecimento.categoria GROUP BY qt.categoria HAVING COUNT(*)=1), sugestao_nome=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.deleted_at IS NULL AND qt.categoria=_qualificacoes_enriquecimento.categoria GROUP BY qt.categoria HAVING COUNT(*)=1), status=CASE WHEN (SELECT COUNT(*) FROM qualificacoes_tipos qt WHERE qt.deleted_at IS NULL AND qt.categoria=_qualificacoes_enriquecimento.categoria)=1 THEN 'AUTO_SUGGESTED' ELSE 'PENDING' END WHERE status='PENDING';"

echo "📝 Auditoria criação staging"
run "Audit staging" "INSERT INTO auditoria_avancada_v2 (tabela,registro_id,acao,dados_novos,origem) VALUES ('_qualificacoes_enriquecimento',0,'ENRICH_INIT',json_object('total_pending',(SELECT COUNT(*) FROM _qualificacoes_enriquecimento WHERE status='PENDING'),'total_suggested',(SELECT COUNT(*) FROM _qualificacoes_enriquecimento WHERE status='AUTO_SUGGESTED')), 'enrichment_script');"

echo "📊 Métricas staging"
wrangler d1 execute "$DB" --remote --command "SELECT status, COUNT(*) qtd FROM _qualificacoes_enriquecimento GROUP BY status;"

echo "✅ Staging criada. Edite sugestões antes de confirmar mapping."