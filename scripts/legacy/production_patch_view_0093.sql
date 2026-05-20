-- Production Patch: View 0093 adiciona data_validade calculada e data_conclusao NULL
-- Run: wrangler d1 execute airtrust-db --remote --file production_patch_view_0093.sql

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
  NULL AS data_conclusao,
  CASE
    WHEN qh.validade IS NOT NULL AND qh.validade <> '' THEN DATE(qh.updated_at, '+' || qh.validade || ' months')
    WHEN qt.validade_meses IS NOT NULL THEN DATE(qh.updated_at, '+' || qt.validade_meses || ' months')
    ELSE NULL
  END AS data_validade,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
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
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN (qh.validade IS NULL OR qh.validade = '') AND qt.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN (
      (qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') < DATE('now')) OR
      (qh.validade IS NULL AND qt.validade_meses IS NOT NULL AND DATE(qh.updated_at, '+' || qt.validade_meses || ' months') < DATE('now'))
    ) THEN 'VENCIDA'
    WHEN (
      (qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') BETWEEN DATE('now') AND DATE('now', '+30 days')) OR
      (qh.validade IS NULL AND qt.validade_meses IS NOT NULL AND DATE(qh.updated_at, '+' || qt.validade_meses || ' months') BETWEEN DATE('now') AND DATE('now', '+30 days'))
    ) THEN 'PROXIMA_VENCIMENTO'
    WHEN (
      (qh.validade IS NOT NULL AND DATE(qh.updated_at, '+' || qh.validade || ' months') BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days')) OR
      (qh.validade IS NULL AND qt.validade_meses IS NOT NULL AND DATE(qh.updated_at, '+' || qt.validade_meses || ' months') BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days'))
    ) THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.validade IS NOT NULL AND qh.validade <> '' THEN CAST((julianday(DATE(qh.updated_at, '+' || qh.validade || ' months')) - julianday('now')) AS INTEGER)
    WHEN qh.validade IS NULL AND qt.validade_meses IS NOT NULL THEN CAST((julianday(DATE(qh.updated_at, '+' || qt.validade_meses || ' months')) - julianday('now')) AS INTEGER)
    ELSE NULL
  END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;