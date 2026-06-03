-- AirTrust - Documentos canonical schema extracted from the approved R04.3 design.
-- Scope: stabilize the base documentos table and the safe supporting indexes.
-- Intentionally additive and idempotent. No destructive changes.
-- Baseline: production structural probe confirmed documentos without historico_id
-- and sha256_hash, with empresa_id DEFAULT 1.

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  empresa_id INTEGER DEFAULT 1,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa
  ON documentos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario
  ON documentos(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_documentos_deleted
  ON documentos(deleted_at);

CREATE INDEX IF NOT EXISTS idx_documentos_tipo
  ON documentos(tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo
  ON documentos(funcionario_id, tipo)
  WHERE deleted_at IS NULL;
