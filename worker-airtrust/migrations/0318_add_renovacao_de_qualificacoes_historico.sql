-- Migration 0318: Adicionar coluna renovacao_de em qualificacoes_historico
-- Data: 2026-03-31
-- Objetivo: Rastrear encadeamento de renovações — renovacao_de aponta para o ID
--           da qualificação anterior que este registro renova.
--
-- SAFE: ADD COLUMN com DEFAULT NULL nunca afeta dados existentes.
-- O código em fix-renovadas.ts e auditoria.ts já usa verificação dinâmica
-- de esquema (schemaColumns.has('renovacao_de')) que passa a retornar true
-- após esta migration.

ALTER TABLE qualificacoes_historico ADD COLUMN renovacao_de INTEGER DEFAULT NULL;

-- Índice para acelerar consultas de encadeamento de renovações
CREATE INDEX IF NOT EXISTS idx_qh_renovacao_de ON qualificacoes_historico(renovacao_de) WHERE renovacao_de IS NOT NULL;
