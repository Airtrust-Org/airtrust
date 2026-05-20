-- 0050_replace_integrated_view.sql
-- Atualiza a view integrada para incluir colunas adicionais usadas em payload full.

DROP VIEW IF EXISTS qualificacoes_historico_integrado;
CREATE VIEW qualificacoes_historico_integrado AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.certificado_numero,
  qh.certificado_url,
  qh.certificado_nome,
  qh.nota,
  qh.resultado,
  qh.instrutor,
  qh.local,
  qh.observacoes,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
  -- Legados para compatibilidade quando minimal=false
  qh.categoria AS categoria_legacy,
  qh.tipo AS tipo_legacy,
  qh.codigo AS codigo_legacy,
  -- Dados normalizados
  COALESCE(qt.nome, qh.tipo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade_meses AS validade_meses,
  CASE
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    ELSE 'VALIDA'
  END AS status,
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