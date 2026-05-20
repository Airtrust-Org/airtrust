-- ==========================================
-- MIGRATION 0027: Create fichas_sessao_manobras table
-- Data: 2025-11-20
-- Objetivo: Criar tabela para manobras das fichas (alias compatível)
-- ==========================================

-- Esta tabela é um alias para ficha_manobras_avaliacao com compatibilidade de código
CREATE TABLE IF NOT EXISTS fichas_sessao_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ordem INTEGER DEFAULT 0,
  resultado TEXT DEFAULT 'NAO_REALIZADA',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY(ficha_id) REFERENCES fichas_sessao(id)
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ficha ON fichas_sessao_manobras(ficha_id);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_deleted ON fichas_sessao_manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_manobras_ordem ON fichas_sessao_manobras(ficha_id, ordem);
