-- Migration 0115: Corrigir coluna admissao
-- Excel tem "Admissao" -> DB deve ter "admissao" (não admissao_date)

-- 1. Dropar views que dependem de qualificacoes_historico_v
DROP VIEW IF EXISTS qualificacoes_historico_risco_v;
DROP VIEW IF EXISTS qualificacoes_historico_v;

-- 2. Dropar a coluna admissao_date criada por engano
ALTER TABLE funcionarios DROP COLUMN admissao_date;

-- 3. Recriar a view usando 'admissao' ao invés de 'admissao_date'
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
  f.guerra AS funcionario_nome_guerra,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.admissao AS funcionario_data_admissao,
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

-- 4. Recriar a view de risco
CREATE VIEW qualificacoes_historico_risco_v AS 
SELECT 
  COUNT(*) AS total, 
  SUM(CASE WHEN status_qualificacao = 'VALIDA' THEN 1 ELSE 0 END) AS validas, 
  SUM(CASE WHEN status_qualificacao = 'VENCIDA' THEN 1 ELSE 0 END) AS vencidas, 
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS faixa_0_30, 
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS faixa_31_60, 
  SUM(CASE WHEN dias_ate_vencimento > 60 THEN 1 ELSE 0 END) AS faixa_60_plus, 
  SUM(CASE WHEN status_qualificacao = 'INDETERMINADA' THEN 1 ELSE 0 END) AS indeterminadas 
FROM qualificacoes_historico_v;
