-- Migration: Corrigir foreign key modelos_sessao_manobras
-- Data: 2025-12-02
-- Objetivo: Apontar FK para tabela 'manobras' ao invés de 'cadastro_manobras'

-- SQLite não suporta ALTER CONSTRAINT, então precisamos recriar a tabela

-- 1. Criar tabela temporária com FK correta
CREATE TABLE IF NOT EXISTS modelos_sessao_manobras_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  observacoes TEXT,
  
  -- Auditoria
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  created_by TEXT,
  updated_by TEXT,
  
  -- Foreign Keys CORRIGIDAS
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  
  -- Constraint: não permitir manobra duplicada no mesmo modelo
  UNIQUE(modelo_id, manobra_id)
);

-- 2. Copiar dados existentes
INSERT INTO modelos_sessao_manobras_new 
  (id, modelo_id, manobra_id, ordem, obrigatoria, observacoes, 
   created_at, updated_at, deleted_at, created_by, updated_by)
SELECT 
  id, modelo_id, manobra_id, ordem, obrigatoria, observacoes,
  created_at, updated_at, deleted_at, created_by, updated_by
FROM modelos_sessao_manobras;

-- 3. Dropar tabela antiga
DROP TABLE modelos_sessao_manobras;

-- 4. Renomear nova tabela
ALTER TABLE modelos_sessao_manobras_new RENAME TO modelos_sessao_manobras;

-- 5. Recriar trigger de updated_at
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras
FOR EACH ROW
BEGIN
  UPDATE modelos_sessao_manobras
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;

-- 6. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_modelo_id 
  ON modelos_sessao_manobras(modelo_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_manobra_id 
  ON modelos_sessao_manobras(manobra_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_ordem 
  ON modelos_sessao_manobras(modelo_id, ordem);
