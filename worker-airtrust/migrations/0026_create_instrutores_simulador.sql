-- ==========================================
-- MIGRATION 0026: Create instrutores_simulador table
-- Data: 2025-11-20
-- Objetivo: Criar tabela faltante para gerenciar instrutores de simulador
-- ==========================================

CREATE TABLE IF NOT EXISTS instrutores_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  habilitacoes TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_instrutores_simulador_funcionario ON instrutores_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_instrutores_simulador_deleted ON instrutores_simulador(deleted_at);
