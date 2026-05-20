-- ============================================
-- MIGRATION 0089: View Priorizar Dados Reais do Histórico
-- Usa tipo_codigo, codigo, categoria, orgao_emissor diretamente de qualificacoes_historico
-- Remove dependências excessivas dos campos do tipo; fallback apenas para display
-- ============================================

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  -- Dados do histórico priorizados
  qh.tipo_codigo AS qualificacao_codigo,
  qh.tipo_codigo AS qualificacao_nome,
  qh.categoria AS qualificacao_categoria,
  qh.orgao_emissor AS qualificacao_orgao_emissor,
  -- Display composto fallback
  COALESCE(qh.tipo_codigo, qt.codigo, qt.nome) AS qualificacao_display,
  -- Datas
  qh.data_conclusao,
  qh.data_vencimento,
  qh.data_vencimento AS data_validade,
  qh.validade_meses,
  -- Certificação / observações
  qh.numero_certificado,
  qh.observacoes,
  qh.arquivo_url,
  -- Analíticos
  qh.instrutor,
  qh.local,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  -- Auditoria
  qh.created_at,
  qh.updated_at,
  -- Status derivado
  CASE
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
  -- Funcionário (SSOT)
  f.nome AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cpf AS funcionario_cpf,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.departamento AS funcionario_departamento,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.foto_url AS funcionario_foto_url,
  f.data_admissao AS funcionario_data_admissao,
  f.rg AS funcionario_rg,
  f.data_nascimento AS funcionario_data_nascimento,
  f.sexo AS funcionario_sexo,
  f.nacionalidade AS funcionario_nacionalidade,
  f.cep AS funcionario_cep,
  f.logradouro AS funcionario_logradouro,
  f.numero AS funcionario_numero,
  f.complemento AS funcionario_complemento,
  f.bairro AS funcionario_bairro,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,
  f.sispat AS funcionario_sispat,
  f.prestserv AS funcionario_prestserv,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,
  f.observacoes AS funcionario_observacoes
FROM qualificacoes_historico qh
INNER JOIN funcionarios f 
  ON qh.funcionario_id = f.id 
  AND f.deleted_at IS NULL
INNER JOIN qualificacoes_tipos qt 
  ON qh.qualificacao_id = qt.id 
  AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
ORDER BY qh.data_vencimento ASC;
