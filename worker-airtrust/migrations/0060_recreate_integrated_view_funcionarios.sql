-- ============================================================
-- MIGRATION 0060: Recriar View Integrada com Campos Ampliados
-- Data: 2025-11-21
-- Objetivo: Incluir novos campos reativos de funcionários adicionados
--           na migration 0059 para auditorias e UI avançada.
-- Dependências: qualificacoes_historico, qualificacoes_tipos, funcionarios (paridade completa)
-- ============================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;

CREATE VIEW qualificacoes_historico_v AS
SELECT 
  -- IDs
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,

  -- Instância da qualificação
  qh.data_conclusao,
  qh.data_vencimento,
  qh.certificado_numero,
  qh.certificado_url,
  qh.certificado_nome,
  qh.nota,
  qh.resultado,
  qh.instrutor,
  qh.local,
  qh.observacoes,

  -- Dados reativos do TIPO
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.nome 
    ELSE COALESCE(qh.tipo, qh.codigo, 'Tipo Desconhecido') END AS qualificacao_nome,
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.codigo 
    ELSE COALESCE(qh.codigo, 'SEM-COD') END AS qualificacao_codigo,
  CASE 
    WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN qt.categoria 
    ELSE COALESCE(qh.categoria, 'Sem Categoria') END AS qualificacao_categoria,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.descricao AS qualificacao_descricao,

  -- Flag integração
  CASE WHEN qh.qualificacao_id IS NOT NULL AND qt.id IS NOT NULL THEN 1 ELSE 0 END AS is_integrated,

  -- Funcionário reativo (campos expandidos - prefixo funcionario_*)
  f.nome                  AS funcionario_nome,
  f.nome_guerra           AS funcionario_nome_guerra,
  f.matricula             AS funcionario_matricula,
  f.cargo                 AS funcionario_cargo,
  f.funcao                AS funcionario_funcao,
  f.setor                 AS funcionario_setor,
  f.base                  AS funcionario_base,
  f.aeronave              AS funcionario_aeronave,
  f.email                 AS funcionario_email,
  f.codigo_anac           AS funcionario_codigo_anac,
  f.is_instrutor          AS funcionario_is_instrutor,
  f.is_checador           AS funcionario_is_checador,
  f.data_admissao         AS funcionario_data_admissao,
  f.status                AS funcionario_status,
  f.rg                    AS funcionario_rg,
  f.data_nascimento       AS funcionario_data_nascimento,
  f.sexo                  AS funcionario_sexo,
  f.nacionalidade         AS funcionario_nacionalidade,
  f.telefone_emergencia   AS funcionario_telefone_emergencia,
  f.contato_emergencia_nome AS funcionario_contato_emergencia_nome,
  f.foto_url              AS funcionario_foto_url,
  f.nivel_icao            AS funcionario_nivel_icao,
  f.validade_icao         AS funcionario_validade_icao,
  f.cma                   AS funcionario_cma,
  f.validade_cma          AS funcionario_validade_cma,
  f.aso                   AS funcionario_aso,
  f.validade_aso          AS funcionario_validade_aso,
  f.sispat                AS funcionario_sispat,
  f.prestserv             AS funcionario_prestserv,
  f.cep                   AS funcionario_cep,
  f.logradouro            AS funcionario_logradouro,
  f.numero                AS funcionario_numero,
  f.complemento           AS funcionario_complemento,
  f.bairro                AS funcionario_bairro,
  f.cidade                AS funcionario_cidade,
  f.estado                AS funcionario_estado,
  f.observacoes           AS funcionario_observacoes,
  CASE 
    WHEN f.ativo IS NOT NULL THEN f.ativo
    WHEN f.status IS NULL THEN 1
    WHEN UPPER(COALESCE(f.status,'ATIVO')) = 'ATIVO' THEN 1
    ELSE 0 END            AS funcionario_ativo,

  -- Status dinâmico da qualificação
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,

  -- Auditoria
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

-- Observação: Índices virtuais não aplicáveis à VIEW.
