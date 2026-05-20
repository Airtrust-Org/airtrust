-- Migration 0100: Delete empty tables qualificacoes and habilitacoes_funcionarios
-- Purpose: Remove obsolete tables that are not used in the new architecture
-- Date: 2025-11-23
--
-- Tables to delete:
-- - qualificacoes (empty, replaced by qualificacoes_tipos and qualificacoes_historico)
-- - habilitacoes_funcionarios (empty, not used in current design)
--
-- Safety: Both tables are empty (0 records)

-- Drop constraints/FK that might reference these tables
DROP VIEW IF EXISTS qualificacoes_v;
DROP VIEW IF EXISTS habilitacoes_funcionarios_v;

-- Delete the main tables
DROP TABLE IF EXISTS qualificacoes;
DROP TABLE IF EXISTS habilitacoes_funcionarios;

-- Cleanup: Remove any orphaned indexes/triggers
DROP TRIGGER IF EXISTS qualificacoes_update;
DROP TRIGGER IF EXISTS habilitacoes_funcionarios_update;
DROP INDEX IF EXISTS idx_qualificacoes_codigo;
DROP INDEX IF EXISTS idx_habilitacoes_funcionarios_funcionario_id;
