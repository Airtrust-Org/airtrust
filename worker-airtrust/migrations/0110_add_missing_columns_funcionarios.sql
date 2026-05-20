-- ================================================================
-- Migration 0110: Adicionar colunas faltantes em funcionarios (SEGURA)
-- Data: 2025-11-25
-- Objetivo: Adicionar colunas necessárias para sistema de importação v2
--           SEM dropar tabela ou perder dados existentes
-- ================================================================

-- Adicionar APENAS as colunas que realmente faltam
-- Colunas existentes: nome_guerra → mapeamento para 'guerra'
-- Colunas existentes: data_nascimento, telefone, aeronave, sispat, prestserv → já existem!
-- Faltam: licenca, canac, admissao

ALTER TABLE funcionarios ADD COLUMN licenca TEXT;
ALTER TABLE funcionarios ADD COLUMN canac TEXT;
ALTER TABLE funcionarios ADD COLUMN admissao TEXT;

-- Auditoria
SELECT '0110_add_missing_columns_funcionarios' AS migration_applied,
       COUNT(*) AS total_registros,
       (SELECT COUNT(*) FROM pragma_table_info('funcionarios')) AS total_colunas_apos
FROM funcionarios;
