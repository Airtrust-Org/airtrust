-- ============================================================
-- MIGRATION 0056: VIEW Integrada Definitiva (força dados reativos)
-- Data: 2025-11-21
-- Objetivo: Garantir que TODAS as informações de nome/código/categoria/descricao/validade
--           venham de qualificacoes_tipos e dados de funcionário via JOIN.
--           Adiciona flag is_integrated e campos adicionais do funcionário.
-- ============================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT 
  -- IDs
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,

  -- Instância
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

  -- Dados reativos do TIPO
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.nome 
    ELSE COALESCE(qh.tipo, qh.codigo, 'Tipo Desconhecido') END AS qualificacao_nome,
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.codigo 
    ELSE COALESCE(qh.codigo, 'SEM-COD') END AS qualificacao_codigo,
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.categoria 
    ELSE COALESCE(qh.categoria, 'Sem Categoria') END AS qualificacao_categoria,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.descricao AS qualificacao_descricao,

  -- Flag integração
  CASE WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN 1 ELSE 0 END AS is_integrated,

  -- Funcionário reativo
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,

  -- Status dinâmico
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,

  -- Audit
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
