-- ============================================================
-- MIGRATION 0065: View compat (qualificacoes_historico_v)
-- Data: 2025-11-21
-- Objetivo: Recriar view com todas as colunas esperadas pelas rotas legado
--            após normalização (0063) para evitar 500 (colunas ausentes).
-- ============================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  f.nome AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.data_admissao AS funcionario_data_admissao,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,

  qh.qualificacao_id,
  qt.nome AS qualificacao_nome,
  qt.codigo AS qualificacao_codigo,
  qt.categoria AS qualificacao_categoria,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.descricao AS qualificacao_descricao,

  1 AS is_integrated,

  NULL AS data_conclusao, -- não presente no schema normalizado
  qh.validade AS data_vencimento,

  -- status derivado conforme janela
  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now','+30 day') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.validade) BETWEEN DATE('now','+31 day') AND DATE('now','+60 day') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,

  CASE
    WHEN qh.validade IS NULL THEN NULL
    ELSE CAST((julianday(qh.validade) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento,

  qh.numero_certificado AS certificado_numero,
  qh.arquivo_url AS certificado_url,
  NULL AS certificado_nome,
  NULL AS nota,
  NULL AS resultado,
  NULL AS instrutor,
  NULL AS local,
  qh.observacoes,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

-- ============================================================
-- FIM MIGRATION 0065
-- ============================================================