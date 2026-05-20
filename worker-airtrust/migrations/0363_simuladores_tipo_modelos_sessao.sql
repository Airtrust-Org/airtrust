-- Migration 0363: Inicializar tipo (SIMULADOR|AERONAVE) em modelos_sessao
-- A coluna tipo já existia na tabela com uso histórico (null para registros antigos).
-- Atualiza todos os registros existentes para 'SIMULADOR' (retrocompatível).

UPDATE modelos_sessao SET tipo = 'SIMULADOR' WHERE tipo IS NULL;

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo ON modelos_sessao(tipo);
