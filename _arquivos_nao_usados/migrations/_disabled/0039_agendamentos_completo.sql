-- ============================================
-- MIGRATION 0039: Sistema Completo de Agendamentos
-- Data: 22/10/2025
-- Objetivo: Garantir estrutura completa para agendamentos
-- ============================================

-- Garantir que agendamentos_simulador existe com todos os campos
CREATE TABLE IF NOT EXISTS agendamentos_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_agendamento TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  status TEXT DEFAULT 'AGENDADO' CHECK(status IN ('AGENDADO', 'CONFIRMADO', 'CANCELADO', 'REALIZADO', 'FALTA')),
  tipo_sessao TEXT CHECK(tipo_sessao IN ('TREINAMENTO', 'CHECK', 'AVALIACAO', 'PRATICA')),
  instrutor_id INTEGER,
  observacoes TEXT,
  resultado TEXT,
  nota REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_data 
  ON agendamentos_simulador(data_agendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario 
  ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_id 
  ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status 
  ON agendamentos_simulador(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_instrutor 
  ON agendamentos_simulador(instrutor_id);

-- Garantir que simuladores tem campos necessários
-- Nota: SQLite não suporta ADD COLUMN IF NOT EXISTS nativamente
-- Vamos usar uma abordagem segura com verificação
