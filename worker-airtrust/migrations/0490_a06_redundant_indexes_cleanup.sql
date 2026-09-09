-- Migration 0490: A-06 - Remocao de Indices Redundantes (Categoria A)
-- Removes exact duplicates found in the final schema to save storage and write performance.
-- Operational marker: verify coexistence in sqlite_master before applying.

-- fichas_sessao: keep idx_fichas_sessao_instrutor and idx_fichas_sessao_empresa
DROP INDEX IF EXISTS idx_fichas_instrutor;
DROP INDEX IF EXISTS idx_fichas_sessao_empresa_id;

-- modelos_sessao: keep idx_modelos_sessao_codigo and idx_modelos_sessao_deleted
DROP INDEX IF EXISTS idx_modelos_codigo;
DROP INDEX IF EXISTS idx_modelos_deleted;
