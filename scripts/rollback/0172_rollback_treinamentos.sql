-- ==========================================
-- MIGRATION 0172 ROLLBACK: Remover Tabelas de Treinamentos
-- Data: 2026-01-08
-- Objetivo: Reverter criação de tabelas de treinamentos (funcionalidade integrada em qualificações)
-- ==========================================

-- Drop tabelas na ordem inversa (respeitando foreign keys)
DROP TABLE IF EXISTS treinamentos_participantes;
DROP TABLE IF EXISTS treinamentos_planejados;

-- Drop índices
DROP INDEX IF EXISTS idx_treinamentos_status;
DROP INDEX IF EXISTS idx_treinamentos_data;
DROP INDEX IF EXISTS idx_treinamentos_empresa;
DROP INDEX IF EXISTS idx_treinamentos_instrutor;
DROP INDEX IF EXISTS idx_participantes_treinamento;
DROP INDEX IF EXISTS idx_participantes_funcionario;
