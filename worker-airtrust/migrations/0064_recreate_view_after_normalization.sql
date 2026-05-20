-- ============================================================
-- MIGRATION 0064: Recriar View qualificacoes_historico_v após normalização (0063)
-- Data: 2025-11-21
-- Objetivo: Ajustar view reativa ao novo schema simplificado de qualificacoes_historico
-- ============================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo,
  qh.codigo,
  qh.categoria,
  qh.validade,
  qh.numero_certificado,
  qh.orgao_emissor,
  qh.observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,

  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now','+30 day') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.validade) BETWEEN DATE('now','+31 day') AND DATE('now','+60 day') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,

  f.nome AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cpf AS funcionario_cpf,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,
  f.status AS funcionario_status,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.endereco AS funcionario_endereco,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,
  f.data_admissao AS funcionario_data_admissao,
  f.foto_url AS funcionario_foto_url,
  f.observacoes AS funcionario_observacoes
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

-- ============================================================
-- FIM MIGRATION 0064
-- ============================================================
