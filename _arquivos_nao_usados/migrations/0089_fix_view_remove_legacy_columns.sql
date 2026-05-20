-- Migration 0089: Fix view qualificacoes_historico_v removing legacy columns no longer present in qualificacoes_tipos
-- Reason: Frontend error: "no such column: qt.requer_renovacao" after schema slimming (migrations 0031, 0052).
-- Action: Recreate the view with only existing columns from qualificacoes_tipos and prioritized historical metadata.
-- Safe: Uses LEFT JOINs and COALESCE fallbacks; does not reference removed legacy columns.

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id AS historico_id,
  qh.funcionario_id,
  qh.qualificacao_id AS qualificacao_tipo_id,
  qh.status,
  qh.data_emissao,
  qh.data_validade,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.instrutor,
  qh.local,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  qh.deleted_at AS historico_deleted_at,
  qh.created_at AS historico_created_at,
  qh.updated_at AS historico_updated_at,
  -- Prioritized metadata (historico overrides tipo; fallback to tipo; final fallback plain)
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS tipo_codigo,
  COALESCE(qh.tipo_categoria, qh.categoria, qt.categoria) AS tipo_categoria,
  COALESCE(qh.tipo_nome, qt.nome) AS tipo_nome,
  COALESCE(qh.tipo_descricao, qt.descricao) AS tipo_descricao,
  COALESCE(qh.tipo_validade_meses, qh.validade_meses, qt.validade_meses) AS tipo_validade_meses,
  qt.ativo AS tipo_ativo,
  qt.deleted_at AS tipo_deleted_at,
  qt.created_at AS tipo_created_at,
  qt.updated_at AS tipo_updated_at,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.deleted_at AS funcionario_deleted_at,
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL AND qh.tipo_validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN qh.data_vencimento IS NOT NULL AND DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.data_vencimento IS NULL THEN NULL
    ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;

-- Validation guidance:
-- SELECT 1 FROM qualificacoes_historico_v LIMIT 1; should succeed without missing column errors.
-- Count rows vs base: SELECT COUNT(*) FROM qualificacoes_historico_v; should match qualificacoes_historico unless filtering by joins.
