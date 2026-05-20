-- Migration: Add modelo_sessao_id to simulador_agendamentos
-- Date: 2025-01-28
-- Objective: Allow precise linking of session to its model
-- Fixes: Arbitrary model selection bug

ALTER TABLE simulador_agendamentos ADD COLUMN modelo_sessao_id INTEGER REFERENCES modelos_sessao(id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_modelo ON simulador_agendamentos(modelo_sessao_id);
