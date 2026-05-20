-- ================================================================
-- Migration 0244: tabelas auxiliares para integrações bidirecionais
-- ================================================================

CREATE TABLE IF NOT EXISTS frms_carga_trabalho (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  escala_id TEXT,
  escala_tripulacao_id TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  tipo_alocacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frms_carga_funcionario
  ON frms_carga_trabalho(funcionario_id, deleted_at);

CREATE TABLE IF NOT EXISTS hospedagem_sugestoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  escala_id TEXT,
  base TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hospedagem_sugestoes_funcionario
  ON hospedagem_sugestoes(funcionario_id, status, deleted_at);

CREATE TABLE IF NOT EXISTS qualificacoes_pendencias (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  documento_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_pendencias_funcionario
  ON qualificacoes_pendencias(funcionario_id, status, deleted_at);

CREATE TABLE IF NOT EXISTS pasta_virtual_jobs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id TEXT,
  referencia_id TEXT,
  referencia_tipo TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  status_geracao TEXT NOT NULL DEFAULT 'pendente_geracao',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pasta_virtual_jobs_status
  ON pasta_virtual_jobs(empresa_id, status_geracao, deleted_at);
