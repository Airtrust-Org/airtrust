-- Migration 2026: Criar Tabela Licenças
-- Data: 17 de novembro de 2025
-- Objetivo: Criar tabela para gerenciar licenças dos funcionários (PP, PC, PLA, CMA, etc.)

-- ============================================================
-- TABELA: licencas
-- ============================================================
CREATE TABLE IF NOT EXISTS licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  
  -- Dados da Licença
  tipo TEXT NOT NULL,              -- 'PP', 'PC', 'PLA', 'IFR', 'INVA', 'CMA', 'CHT', 'CANAC', etc.
  numero TEXT NOT NULL,            -- Número da licença (ex: '123456')
  
  -- Datas
  data_emissao TEXT NOT NULL,      -- ISO8601 (YYYY-MM-DD)
  data_vencimento TEXT NOT NULL,   -- ISO8601 (YYYY-MM-DD)
  
  -- Observações
  observacoes TEXT,
  
  -- Auditoria
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  
  -- Chave estrangeira
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_licencas_funcionario ON licencas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_licencas_tipo ON licencas(tipo);
CREATE INDEX IF NOT EXISTS idx_licencas_vencimento ON licencas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_licencas_deleted ON licencas(deleted_at);

-- ============================================================
-- COMENTÁRIOS SOBRE TIPOS DE LICENÇAS ANAC
-- ============================================================
-- PP   - Piloto Privado
-- PC   - Piloto Comercial
-- PLA  - Piloto de Linha Aérea
-- IFR  - Instrumento (habilitação)
-- INVA - Instrutor de Voo (Avião)
-- INVH - Instrutor de Voo (Helicóptero)
-- CMA  - Certificado Médico Aeronáutico
-- CHT  - Certificado de Habilitação Técnica
-- CANAC - Carteira ANAC
-- CRM  - Crew Resource Management
-- MLTE - Multi-Engine Land
-- MEP  - Multi-Engine Piston
-- ============================================================

SELECT 'Migration 2026 - Tabela licencas criada com sucesso!' as status;
