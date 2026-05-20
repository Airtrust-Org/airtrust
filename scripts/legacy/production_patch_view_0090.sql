-- Production Patch: View 0090 (compat aliases)
-- Run: wrangler d1 execute airtrust-db --remote --file production_patch_view_0090.sql

DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS qualificacao_codigo,
  COALESCE(qh.tipo_nome, qt.nome) AS qualificacao_nome,
  COALESCE(qh.tipo_categoria, qh.categoria, qt.categoria) AS qualificacao_categoria,
  COALESCE(qh.tipo_descricao, qt.descricao) AS qualificacao_descricao,
  COALESCE(qh.tipo_validade_meses, qh.validade_meses, qt.validade_meses) AS qualificacao_validade_meses,
  COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
  qh.data_conclusao,
  qh.data_vencimento AS data_validade,
  qh.data_vencimento,
  qh.validade_meses,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.instrutor,
  qh.local AS local_treinamento,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
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