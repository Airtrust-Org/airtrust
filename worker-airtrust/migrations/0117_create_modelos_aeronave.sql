-- Migration: Create modelos_aeronave table
-- Created: 2025-11-26
-- Description: Nova tabela para modelos de aeronaves (separado de aeronaves físicas)

CREATE TABLE IF NOT EXISTS modelos_aeronave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  fabricante TEXT,
  tipo TEXT, -- Ex: Jato, Turboélice, Helicóptero
  categoria TEXT, -- Ex: Comercial, Executivo, Militar
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- Index para busca por código
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_codigo ON modelos_aeronave(codigo);

-- Index para busca por nome
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_nome ON modelos_aeronave(nome);

-- Index para ativos
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_ativo ON modelos_aeronave(ativo);

-- Seed data de exemplo
INSERT INTO modelos_aeronave (codigo, nome, fabricante, tipo, categoria, ativo) VALUES
('A320', 'Airbus A320', 'Airbus', 'Jato', 'Comercial', 1),
('B737', 'Boeing 737', 'Boeing', 'Jato', 'Comercial', 1),
('E195', 'Embraer E195', 'Embraer', 'Jato', 'Comercial', 1),
('ATR72', 'ATR 72', 'ATR Aircraft', 'Turboélice', 'Comercial', 1);
