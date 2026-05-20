-- NOTE: Physical columns already exist in production; this bundle is idempotent.
-- Column creation statements removed after first successful apply (avoids duplicate column errors).

UPDATE qualificacoes_historico SET data_conclusao = created_at WHERE data_conclusao IS NULL;
-- Normalize vencimento (validade) into data_vencimento existing column
UPDATE qualificacoes_historico SET data_vencimento = CASE
  WHEN validade GLOB '[0-9]*' AND validade <> '' THEN DATE(created_at, '+' || validade || ' months')
  WHEN validade LIKE '____-__-__' THEN validade
  ELSE NULL END WHERE data_vencimento IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

-- 0096 backfill codes & categoria
UPDATE qualificacoes_historico
SET tipo_codigo = (SELECT codigo FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1)
WHERE (tipo_codigo IS NULL OR tipo_codigo = '') AND qualificacao_id IS NOT NULL;
UPDATE qualificacoes_historico
SET categoria = (SELECT categoria FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1)
WHERE categoria = 'DESCONHECIDO' AND qualificacao_id IS NOT NULL AND (SELECT categoria FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id LIMIT 1) IS NOT NULL;
UPDATE qualificacoes_historico SET codigo = tipo_codigo WHERE (codigo IS NULL OR codigo = '') AND tipo_codigo IS NOT NULL;

-- 0097 rebuild view
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
  CASE WHEN qh.validade GLOB '[0-9]*' THEN CAST(qh.validade AS INTEGER) ELSE qt.validade_meses END AS qualificacao_validade_meses,
  COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
  qh.data_conclusao,
  qh.data_vencimento AS data_validade,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.nota,
  qh.instrutor,
  qh.local AS local_treinamento,
  qh.modalidade,
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
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE WHEN qh.data_vencimento IS NULL THEN NULL ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER) END AS dias_ate_vencimento
FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
  LEFT JOIN funcionarios f ON qh.funcionario_id = f.id;
