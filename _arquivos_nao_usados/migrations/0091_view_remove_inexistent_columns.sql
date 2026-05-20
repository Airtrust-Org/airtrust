-- Migration 0091: Remove referências a colunas inexistentes no histórico (tipo_nome, tipo_descricao, tipo_validade_meses, tipo_categoria)
-- Base table columns: tipo_codigo, codigo, categoria, validade, numero_certificado, observacoes, arquivo_url
-- Ajuste evita erros: "no such column: qh.tipo_nome"

DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  -- Código: histórico tem tipo_codigo (preferir) senão codigo, fallback qt.codigo, último qualificacao_id
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo, qh.qualificacao_id) AS qualificacao_codigo,
  -- Nome: não existe nome no histórico, usar tipo (qt.nome)
  qt.nome AS qualificacao_nome,
  -- Categoria: histórico guarda categoria própria, fallback tipo
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  -- Descrição: apenas do tipo
  qt.descricao AS qualificacao_descricao,
  -- Validade meses: histórico guarda texto em qh.validade (interpretar como meses se numérico), fallback tipo.validade_meses
  COALESCE(qh.validade, qt.validade_meses) AS qualificacao_validade_meses,
  COALESCE(qh.tipo_codigo, qh.codigo, (qt.codigo || ' - ' || qt.nome), 'SEM CODIGO') AS qualificacao_display,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
  -- Funcionário campos básicos (expandir conforme necessidade)
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,
  -- Status derivado
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