-- ============================================
-- MIGRATION 0040: Adicionar campos ao agendamentos_simulador
-- Data: 22/10/2025
-- Objetivo: Adicionar campos faltantes para compatibilidade
-- ============================================

-- Adicionar campos de data/hora separados
ALTER TABLE agendamentos_simulador ADD COLUMN data_agendamento TEXT;
ALTER TABLE agendamentos_simulador ADD COLUMN hora_inicio TEXT;
ALTER TABLE agendamentos_simulador ADD COLUMN hora_fim TEXT;

-- Adicionar campos adicionais
ALTER TABLE agendamentos_simulador ADD COLUMN instrutor_id INTEGER;
ALTER TABLE agendamentos_simulador ADD COLUMN resultado TEXT;
ALTER TABLE agendamentos_simulador ADD COLUMN nota REAL;
ALTER TABLE agendamentos_simulador ADD COLUMN deleted_at TEXT;

-- Preencher campos novos com base nos existentes
UPDATE agendamentos_simulador
SET 
  data_agendamento = date(data_inicio),
  hora_inicio = time(data_inicio),
  hora_fim = time(data_fim)
WHERE data_agendamento IS NULL;

-- Criar índices adicionais
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_agendamento 
  ON agendamentos_simulador(data_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_instrutor 
  ON agendamentos_simulador(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted 
  ON agendamentos_simulador(deleted_at);
