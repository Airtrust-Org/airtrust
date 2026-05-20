-- ================================================================
-- Migration 0111: Adicionar colunas faltantes em qualificacoes_tipos
-- Data: 2025-11-25
-- Objetivo: Adicionar colunas necessárias para sistema de importação v2
--           SEM dropar tabela ou perder dados existentes
-- ================================================================

-- Colunas existentes: id, nome, codigo, categoria, validade_meses, descricao, ativo, created_at, updated_at, deleted_at
-- Colunas necessárias: tipo, carga_horaria, validade (alias para validade_meses), observacoes (alias para descricao)

-- Adicionar apenas a coluna que realmente falta
ALTER TABLE qualificacoes_tipos ADD COLUMN tipo TEXT;
ALTER TABLE qualificacoes_tipos ADD COLUMN carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0);

-- Criar índices para performance (idempotentes)
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_tipo ON qualificacoes_tipos(tipo) WHERE deleted_at IS NULL;

-- Auditoria
SELECT '0111_add_missing_columns_qualificacoes_tipos' AS migration_applied,
       COUNT(*) AS total_registros,
       (SELECT COUNT(*) FROM pragma_table_info('qualificacoes_tipos')) AS total_colunas_apos
FROM qualificacoes_tipos;
