-- ================================================================
-- Migration 0112: Adicionar colunas faltantes em qualificacoes_historico
-- Data: 2025-11-25
-- Objetivo: Adicionar colunas necessárias para sistema de importação v2
--           Preparar para FK checks (funcionario_cpf, qualificacao_codigo)
-- ================================================================

-- Colunas existentes: id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, 
--   validade, numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at, 
--   data_conclusao, validade_meses, instrutor, local, modalidade, nota, carga_horaria, 
--   data_vencimento, renovada, certificado_arquivo_id

-- Adicionar colunas de FK que o sistema refatorado espera
ALTER TABLE qualificacoes_historico ADD COLUMN funcionario_cpf TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN qualificacao_codigo TEXT COLLATE NOCASE;

-- Backfill: popular com dados existentes (JOIN com funcionarios e qualificacoes_tipos)
UPDATE qualificacoes_historico
SET funcionario_cpf = (
  SELECT cpf FROM funcionarios WHERE funcionarios.id = qualificacoes_historico.funcionario_id
)
WHERE funcionario_cpf IS NULL AND funcionario_id IS NOT NULL;

UPDATE qualificacoes_historico
SET qualificacao_codigo = (
  SELECT codigo FROM qualificacoes_tipos WHERE qualificacoes_tipos.id = qualificacoes_historico.qualificacao_id
)
WHERE qualificacao_codigo IS NULL AND qualificacao_id IS NOT NULL;

-- Criar índices para FK lookups (idempotentes)
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;

-- Auditoria
SELECT '0112_add_missing_columns_qualificacoes_historico' AS migration_applied,
       COUNT(*) AS total_registros,
       COUNT(funcionario_cpf) AS registros_com_cpf,
       COUNT(qualificacao_codigo) AS registros_com_codigo,
       (SELECT COUNT(*) FROM pragma_table_info('qualificacoes_historico')) AS total_colunas_apos
FROM qualificacoes_historico;
