-- production_patch_view_0087.sql
-- Aplicação direta da correção da view (LEFT JOIN + preservação de órfãos)
-- Execute isoladamente no D1 remoto caso cadeia de migrations esteja bloqueada.

DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo) AS qualificacao_codigo,
  COALESCE(qh.tipo_codigo, qt.nome) AS qualificacao_nome,
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  qt.descricao AS qualificacao_descricao,
  COALESCE(qh.validade_meses, qt.validade_meses) AS qualificacao_validade_meses,
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
  CASE
    WHEN qh.deleted_at IS NOT NULL THEN 'REMOVIDA'
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.data_vencimento IS NULL THEN NULL
    ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo
FROM qualificacoes_historico qh
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND (f.deleted_at IS NULL OR f.deleted_at IS NULL)
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND (qt.deleted_at IS NULL OR qt.deleted_at IS NULL)
WHERE qh.deleted_at IS NULL;
