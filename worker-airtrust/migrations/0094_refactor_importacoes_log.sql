-- Migration: Refatorar tabela importacoes_log para novo formato
-- Data: 2025-11-25
-- Descrição: Atualiza estrutura da tabela para suportar novo sistema de importação

-- 1. Criar nova tabela com estrutura correta
CREATE TABLE IF NOT EXISTS importacoes_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  usuario_id INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  to_create INTEGER NOT NULL DEFAULT 0,
  to_update INTEGER NOT NULL DEFAULT 0,
  to_skip INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  merge_mode TEXT,
  raw_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 2. Copiar dados existentes (se houver)
INSERT INTO importacoes_log_new (id, entidade, usuario_id, total_rows, created, skipped, failed, created_at)
SELECT 
  id,
  COALESCE(entidade, tipo) as entidade,
  usuario_id,
  COALESCE(total_registros, 0) as total_rows,
  COALESCE(sucesso, 0) as created,
  0 as skipped,
  COALESCE(erros, 0) as failed,
  created_at
FROM importacoes_log;

-- 3. Dropar tabela antiga
DROP TABLE importacoes_log;

-- 4. Renomear nova tabela
ALTER TABLE importacoes_log_new RENAME TO importacoes_log;

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_importacoes_log_entidade ON importacoes_log(entidade);
CREATE INDEX IF NOT EXISTS idx_importacoes_log_created_at ON importacoes_log(created_at);
CREATE INDEX IF NOT EXISTS idx_importacoes_log_usuario ON importacoes_log(usuario_id);
