-- Migration: 0407_qualificacoes_tipos_setores
-- Objetivo:
-- 1. Criar vínculo N:N entre qualificacoes_tipos e setores
-- 2. Preservar tipos existentes sem vínculo como transversais
-- 3. Garantir lookup eficiente por empresa/tipo/setor

CREATE TABLE IF NOT EXISTS qualificacoes_tipos_setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qts_unique_active
  ON qualificacoes_tipos_setores(tipo_id, setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qts_tipo_empresa
  ON qualificacoes_tipos_setores(tipo_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qts_setor_empresa
  ON qualificacoes_tipos_setores(setor_id, empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qts_empresa_setor_tipo
  ON qualificacoes_tipos_setores(empresa_id, setor_id, tipo_id)
  WHERE deleted_at IS NULL;
