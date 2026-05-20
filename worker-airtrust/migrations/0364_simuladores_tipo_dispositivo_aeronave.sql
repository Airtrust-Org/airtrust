-- Migration 0364: Adicionar tipo_dispositivo e aeronave_id em simulador_agendamentos
-- tipo_dispositivo distingue se a sessão é em SIMULADOR ou AERONAVE (voo real).
-- Nota: a coluna tipo_sessao já existe com semântica diferente (código do tipo como 'PC', 'IPC').
-- aeronave_id é FK para aeronaves(id) — nullable; preenchido apenas quando tipo_dispositivo='AERONAVE'.

ALTER TABLE simulador_agendamentos ADD COLUMN tipo_dispositivo TEXT NOT NULL DEFAULT 'SIMULADOR'
  CHECK (tipo_dispositivo IN ('SIMULADOR', 'AERONAVE'));

ALTER TABLE simulador_agendamentos ADD COLUMN aeronave_id INTEGER REFERENCES aeronaves(id);

CREATE INDEX IF NOT EXISTS idx_sim_agend_tipo_dispositivo ON simulador_agendamentos(tipo_dispositivo);
CREATE INDEX IF NOT EXISTS idx_sim_agend_aeronave ON simulador_agendamentos(aeronave_id);
