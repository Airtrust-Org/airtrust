-- ============================================================
-- MIGRATION 005: MÓDULO COMPLETO DE LICENÇAS
-- Data: 18/11/2025
-- Objetivo: Implementar 100% do módulo de Licenças conforme auditoria
-- ============================================================

-- 1. CRIAR TABELA DE LICENÇAS
-- ============================================================

CREATE TABLE IF NOT EXISTS licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- 'CMA', 'CANAC', 'CHT', 'PP', 'PC', 'PLA', 'IFR', 'INVA', etc.
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,       -- ISO8601 'YYYY-MM-DD'
  data_vencimento TEXT NOT NULL,    -- ISO8601 'YYYY-MM-DD'
  observacoes TEXT,
  
  -- Auditoria
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- 2. CRIAR ÍNDICES DE PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_licencas_funcionario 
  ON licencas(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_licencas_vencimento 
  ON licencas(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_licencas_tipo 
  ON licencas(tipo);

CREATE INDEX IF NOT EXISTS idx_licencas_deleted_at 
  ON licencas(deleted_at);

-- 3. POPULAR COM DADOS DE EXEMPLO (OPCIONAL)
-- ============================================================

-- Inserir licenças para funcionários existentes (apenas se quiser dados de teste)
-- Comentado por padrão para não poluir produção

/*
INSERT INTO licencas (funcionario_id, tipo, numero, data_emissao, data_vencimento, observacoes)
SELECT 
  id as funcionario_id,
  'CMA' as tipo,
  'CMA' || SUBSTR(matricula, -4) as numero,
  date('now', '-1 year') as data_emissao,
  date('now', '+1 year') as data_vencimento,
  'Licença criada automaticamente para teste' as observacoes
FROM funcionarios
WHERE deleted_at IS NULL
LIMIT 5;
*/

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
