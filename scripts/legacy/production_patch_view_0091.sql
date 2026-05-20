-- Production Patch: View 0091 remove colunas inexistentes
-- Run: wrangler d1 execute airtrust-db --remote --file production_patch_view_0091.sql

DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  qt.descricao AS qualificacao_descricao,
  COALESCE(qh.validade, qt.validade_meses) AS qualificacao_validade_meses,
  COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN (qh.validade IS NULL OR qh.validade = '') AND qt.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') < DATE('now') THEN 'VENCIDA'
    WHEN qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.validade IS NULL OR qh.validade = '' THEN NULL
    ELSE CAST((julianday(DATE(qh.updated_at, '+' || qh.validade || ' months')) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;