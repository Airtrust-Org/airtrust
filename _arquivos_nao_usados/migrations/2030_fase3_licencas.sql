-- ============================================================
-- MIGRATION 2030 - FASE 3: LICENÇAS AERONÁUTICAS
-- ============================================================
-- Criado em: 18/11/2025
-- Objetivo: Tabela licencas para controlar CMA, CANAC, CHT, PP, PC, IFR etc.
-- ============================================================

-- Criar tabela licencas
CREATE TABLE IF NOT EXISTS licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,               -- 'CMA', 'CANAC', 'CHT', 'PP', 'PC', 'PLA', 'IFR', 'INVA', 'INVH', etc.
  numero TEXT NOT NULL,             -- número da licença
  data_emissao TEXT NOT NULL,       -- ISO8601 'YYYY-MM-DD'
  data_vencimento TEXT NOT NULL,    -- ISO8601 'YYYY-MM-DD'
  observacoes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES pessoas(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_licencas_funcionario ON licencas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_licencas_vencimento ON licencas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_licencas_tipo ON licencas(tipo);
CREATE INDEX IF NOT EXISTS idx_licencas_deleted ON licencas(deleted_at);

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
-- Após rodar: SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='licencas';
-- Deve retornar 1
