-- Migration 1016: Versionamento de Arquivos R2
-- Criado em: 2025-10-19
-- Descrição: Adiciona controle de versões para uploads no R2

CREATE TABLE IF NOT EXISTS arquivo_versoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qualificacao_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  version INTEGER NOT NULL,
  size INTEGER,
  content_type TEXT,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_arquivo_versoes_qualificacao 
ON arquivo_versoes(qualificacao_id);

CREATE INDEX IF NOT EXISTS idx_arquivo_versoes_version 
ON arquivo_versoes(version DESC);
