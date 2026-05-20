-- Production Patch: View 0089 (remove legacy columns)
-- Apply safely on production D1: drops and recreates qualificacoes_historico_v without referencing removed columns.
-- Run:
-- wrangler d1 execute airtrust-db --remote --file production_patch_view_0089.sql

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
  CASE WHEN qh.data_vencimento IS NULL THEN NULL ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER) END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;