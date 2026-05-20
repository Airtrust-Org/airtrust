-- ============================================
-- MIGRATION: Consolidação SSOT Dupla (Funcionários + Qualificações)
-- PRESERVANDO TODOS OS DADOS EXISTENTES
-- Data: 2025-11-21
-- Arquivo: 0062_consolidate_ssot_preserve_data.sql
-- ============================================
PRAGMA defer_foreign_keys = ON;
-- ============================================
-- FASE 1: BACKUP
-- ============================================
CREATE TABLE IF NOT EXISTS _backup_qualificacoes_historico AS SELECT * FROM qualificacoes_historico;
CREATE TABLE IF NOT EXISTS _backup_qualificacoes_tipos AS SELECT * FROM qualificacoes_tipos;
CREATE TABLE IF NOT EXISTS _backup_funcionarios AS SELECT * FROM funcionarios;
-- ============================================
-- FASE 2: STATS INICIAIS
-- ============================================
CREATE TEMP TABLE _migration_stats AS
SELECT 
  (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL) as funcionarios_ativos,
  (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) as tipos_ativos,
  (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) as historico_ativo;
-- ============================================
-- FASE 3: MAPEAMENTO TIPOS
-- ============================================
CREATE TEMP TABLE _qualificacoes_mapping AS
SELECT DISTINCT
  qh.id as historico_id,
  qh.tipo_codigo,
  qh.codigo,
  qt.id as qualificacao_tipo_id,
  CASE WHEN qt.id IS NOT NULL THEN 'MATCH_FOUND' ELSE 'NEEDS_CREATE' END as status
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt 
  ON (qh.tipo_codigo = qt.codigo OR qh.codigo = qt.codigo)
  AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
-- ============================================
-- FASE 4: CRIAR TIPOS FALTANTES
-- ============================================
INSERT INTO qualificacoes_tipos (
  codigo, nome, descricao, categoria, orgao_emissor, validade_meses, created_at, updated_at
)
SELECT DISTINCT
  COALESCE(qh.tipo_codigo, qh.codigo) as codigo,
  COALESCE(qh.tipo_codigo, qh.codigo) as nome,
  'Migrado automaticamente do histórico' as descricao,
  CASE 
    WHEN qh.tipo_codigo LIKE '%ICAO%' OR qh.codigo LIKE '%ICAO%' THEN 'ANAC'
    WHEN qh.tipo_codigo LIKE '%CMA%' OR qh.codigo LIKE '%CMA%' THEN 'MEDICA'
    WHEN qh.tipo_codigo LIKE '%ASO%' OR qh.codigo LIKE '%ASO%' THEN 'MEDICA'
    WHEN qh.tipo_codigo LIKE '%CHT%' OR qh.codigo LIKE '%CHT%' THEN 'ANAC'
    WHEN qh.orgao_emissor = 'ANAC' THEN 'ANAC'
    ELSE 'TECNICA'
  END as categoria,
  COALESCE(qh.orgao_emissor, 'A definir') as orgao_emissor,
  NULL as validade_meses,
  datetime('now') as created_at,
  datetime('now') as updated_at
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND COALESCE(qh.tipo_codigo, qh.codigo) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
    WHERE (qt.codigo = qh.tipo_codigo OR qt.codigo = qh.codigo)
      AND qt.deleted_at IS NULL
  )
GROUP BY COALESCE(qh.tipo_codigo, qh.codigo);
-- ============================================
-- FASE 5: COLUNA qualificacao_id (já existente – ignorar caso exista)
-- ============================================
-- (Coluna já presente pelo rebuild anterior; manter compatibilidade)
-- ============================================
-- FASE 6: POPULAR qualificacao_id
-- ============================================
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT qt.id FROM qualificacoes_tipos qt WHERE qt.codigo = qualificacoes_historico.tipo_codigo AND qt.deleted_at IS NULL LIMIT 1
)
WHERE qualificacao_id IS NULL AND tipo_codigo IS NOT NULL AND deleted_at IS NULL;
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT qt.id FROM qualificacoes_tipos qt WHERE qt.codigo = qualificacoes_historico.codigo AND qt.deleted_at IS NULL LIMIT 1
)
WHERE qualificacao_id IS NULL AND codigo IS NOT NULL AND deleted_at IS NULL;
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT qt.id FROM qualificacoes_tipos qt WHERE qt.nome = qualificacoes_historico.codigo AND qt.deleted_at IS NULL LIMIT 1
)
WHERE qualificacao_id IS NULL AND codigo IS NOT NULL AND deleted_at IS NULL;
-- ============================================
-- FASE 7: MAPEAR funcionario_id POR matricula (fallback)
-- ============================================
UPDATE qualificacoes_historico
SET funcionario_id = (
  SELECT f.id FROM funcionarios f WHERE f.matricula = qualificacoes_historico.codigo AND f.deleted_at IS NULL LIMIT 1
)
WHERE funcionario_id IS NULL AND codigo IS NOT NULL AND deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM funcionarios f WHERE f.matricula = qualificacoes_historico.codigo AND f.deleted_at IS NULL
);
-- ============================================
-- FASE 8: VIEW REATIVA COMPLETA (DROP + CREATE)
-- ============================================
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo,
  qh.codigo,
  qh.categoria,
  qh.validade as data_validade,
  qh.numero_certificado,
  qh.orgao_emissor as historico_orgao_emissor,
  qh.observacoes as historico_observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now', '+30 day') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.validade) BETWEEN DATE('now', '+31 day') AND DATE('now', '+60 day') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE WHEN qh.validade IS NULL THEN NULL ELSE CAST((julianday(qh.validade) - julianday('now')) AS INTEGER) END AS dias_ate_vencimento,
  COALESCE(f.nome, qh.codigo) AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.departamento AS funcionario_departamento,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,
  COALESCE(f.status,'ATIVO') AS funcionario_status,
  COALESCE(f.ativo,1) AS funcionario_ativo,
  COALESCE(f.is_instrutor,0) AS funcionario_is_instrutor,
  COALESCE(f.is_checador,0) AS funcionario_is_checador,
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
  f.observacoes AS funcionario_observacoes,
  COALESCE(qt.codigo, qh.tipo_codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  qt.descricao AS qualificacao_descricao,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  COALESCE(qt.orgao_emissor, qh.orgao_emissor) AS qualificacao_orgao_emissor,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.requer_renovacao AS qualificacao_requer_renovacao,
  qt.obrigatoria_para_cargo AS qualificacao_obrigatoria_para_cargo,
  qt.pre_requisitos AS qualificacao_pre_requisitos,
  qt.cor_status AS qualificacao_cor_status,
  qt.icone AS qualificacao_icone,
  qt.ordem_exibicao AS qualificacao_ordem_exibicao
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
-- ============================================
-- FASE 9: TRIGGERS TIPOS (UPDATE / SOFT DELETE / HARD DELETE PREVENT)
-- ============================================
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_update;
CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
BEGIN
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, dados_anteriores, dados_novos, origem)
  VALUES (
    'qualificacoes_tipos', NEW.id, 'UPDATE',
    json_object('codigo', OLD.codigo, 'nome', OLD.nome, 'validade_meses', OLD.validade_meses),
    json_object('codigo', NEW.codigo, 'nome', NEW.nome, 'validade_meses', NEW.validade_meses),
    'system'
  );
END;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_prevent_hard_delete;
CREATE TRIGGER trg_qualificacoes_tipos_prevent_hard_delete
BEFORE DELETE ON qualificacoes_tipos
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'DELETE físico proibido em qualificacoes_tipos. Use soft delete');
END;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_soft_delete;
CREATE TRIGGER trg_qualificacoes_tipos_soft_delete
AFTER UPDATE OF deleted_at ON qualificacoes_tipos
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico SET deleted_at = datetime('now')
  WHERE qualificacao_id = NEW.id AND deleted_at IS NULL;
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem)
  VALUES ('qualificacoes_tipos', NEW.id, 'SOFT_DELETE', 'cascade_trigger');
END;
-- ============================================
-- FASE 10: ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS idx_qualificacoes_historico_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_historico_unico ON qualificacoes_historico(funcionario_id, qualificacao_id, numero_certificado) WHERE deleted_at IS NULL AND numero_certificado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
-- ============================================
-- FASE 11: RELATORIO VALIDACAO
-- ============================================
CREATE TEMP TABLE _migration_validation AS
SELECT 
  'funcionarios_ativos' as metrica,
  (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL) as valor_atual,
  (SELECT funcionarios_ativos FROM _migration_stats) as valor_antes
UNION ALL
SELECT 'tipos_ativos',(SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL),(SELECT tipos_ativos FROM _migration_stats)
UNION ALL
SELECT 'historico_ativo',(SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL),(SELECT historico_ativo FROM _migration_stats)
UNION ALL
SELECT 'historico_com_qualificacao_id',(SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL AND deleted_at IS NULL),NULL
UNION ALL
SELECT 'historico_sem_qualificacao_id',(SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NULL AND deleted_at IS NULL),NULL
UNION ALL
SELECT 'historico_com_funcionario_id',(SELECT COUNT(*) FROM qualificacoes_historico WHERE funcionario_id IS NOT NULL AND deleted_at IS NULL),NULL
UNION ALL
SELECT 'historico_sem_funcionario_id',(SELECT COUNT(*) FROM qualificacoes_historico WHERE funcionario_id IS NULL AND deleted_at IS NULL),NULL;
SELECT * FROM _migration_validation;
-- ============================================
-- FASE 12: AUDITORIA REGISTRO MIGRACAO
-- ============================================
INSERT INTO auditoria_avancada_v2 (
  tabela, registro_id, acao, dados_novos, origem
) VALUES (
  'system_migration', 62, 'UPDATE',
  json_object(
    'migration','0062_consolidate_ssot_preserve_data',
    'date',datetime('now'),
    'funcionarios_ativos',(SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL),
    'tipos_ativos',(SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL),
    'historico_ativo',(SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL),
    'historico_mapeado',(SELECT COUNT(*) FROM qualificacoes_historico WHERE qualificacao_id IS NOT NULL AND deleted_at IS NULL)
  ),
  'migration_script'
);
PRAGMA defer_foreign_keys = OFF;
SELECT '=== MIGRAÇÃO 0062 CONCLUÍDA ===' as status;