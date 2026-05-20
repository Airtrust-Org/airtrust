-- ============================================================
-- MIGRATION 0049: View Integrada de Qualificações
-- Data: 2025-11-21
-- Objetivo: Integrar qualificacoes_historico com qualificacoes_tipos e funcionarios
-- Estratégia: VIEW read-only que mantém compatibilidade e permite rollback fácil
-- ============================================================

CREATE VIEW IF NOT EXISTS qualificacoes_historico_v AS
SELECT 
  -- IDs e FKs
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  
  -- Dados da instância
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
  qh.origem,
  qh.referencia_externa,
  
  -- Dados normalizados do tipo (fallback para legados)
  COALESCE(qt.nome, qh.tipo, qh.codigo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade_meses AS qualificacao_validade_meses,
  
  -- Funcionário
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  
  -- Status computado
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,
  
  -- Auditoria
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;