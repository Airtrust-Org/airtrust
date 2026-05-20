-- 0049_create_integrated_view.sql
-- View de integração segura: reflete atualizações em qualificacoes_tipos e funcionarios
-- Não remove nem altera dados originais; apenas projeta joins consolidados.

CREATE VIEW IF NOT EXISTS qualificacoes_historico_integrado AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.certificado_numero,
  qh.certificado_url,
  qh.nota,
  qh.resultado,
  qh.instrutor,
  qh.local,
  qh.observacoes,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
  -- Dados normalizados provenientes dos tipos (fallback para valores legados caso ainda existam)
  COALESCE(qt.nome, qh.tipo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade_meses AS validade_meses,
  -- Status calculado dinamicamente
  CASE
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    ELSE 'VALIDA'
  END AS status,
  -- Dados do funcionário
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.codigo_anac AS funcionario_codigo_anac,
  f.cargo AS funcionario_cargo
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt 
  ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f 
  ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;