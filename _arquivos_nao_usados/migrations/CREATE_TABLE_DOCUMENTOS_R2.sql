-- ============================================================
-- MIGRATION: Criar tabela documentos para Pasta Virtual R2
-- Data: 2025-11-29
-- Descrição: Tabela para armazenar metadados de documentos 
--            armazenados no R2 (Pasta Virtual)
-- ============================================================

-- Criar tabela documentos se não existir
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  historico_id INTEGER,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario ON documentos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_documentos_historico ON documentos(historico_id);
CREATE INDEX IF NOT EXISTS idx_documentos_deleted ON documentos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documentos_r2_key ON documentos(r2_key);
CREATE INDEX IF NOT EXISTS idx_documentos_uuid ON documentos(uuid);

-- Validação
SELECT 
  'documentos' as tabela,
  COUNT(*) as total_registros,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as ativos,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deletados
FROM documentos;

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
